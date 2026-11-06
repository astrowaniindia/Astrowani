//
//  NotificationService.m
//  Astrowani — Notification Service Extension
//
//  WHAT THIS IS FOR. iOS will not put a picture on a notification unless an
//  extension inside the app fetches it first. The backend has been sending
//  `apns.fcm_options.image` and `mutable-content: 1` since the notification
//  platform was built (2026-11-07, src/push.js), and iPhones have been showing
//  the text only, because `AstrologyApp.xcodeproj` had no extension target. This
//  is that target. Android has never needed one — it renders the big picture from
//  the FCM payload itself.
//
//  ── IT HAS NO DEPENDENCIES, AND THAT IS THE MAIN DESIGN DECISION ────────────
//
//  Firebase's own documentation says to add the Firebase/Messaging pod to the
//  extension and call `[FIRMessaging extensionHelper] populateNotificationContent`.
//  That is NOT done here, on purpose.
//
//  This app's Podfile carries a long, empirically-settled linkage configuration —
//  default static libraries, with the whole Firebase/Google subtree forced to
//  static FRAMEWORKS by a pre_install hook, after both of CocoaPods' blanket
//  fixes were tried and each broke the build somewhere else. Its own comment says
//  "settled empirically over several EAS builds. Read before changing it." Adding
//  a second pod target that pulls Firebase through that machinery is exactly the
//  kind of change it warns about, and the cost of getting it wrong is a broken
//  app link line discovered twenty minutes into an EAS build.
//
//  So: no pods, no Podfile change, no Podfile.lock change. The extension reads the
//  image URL straight out of the payload and downloads it with Foundation. The
//  only thing given up is Firebase's own delivery analytics from the extension,
//  which this project does not use — `notification_sends` already records
//  delivered / opened / clicked per person, reported by the app itself, which is
//  strictly more than FCM would give.
//
//  ── THE ONE RULE ───────────────────────────────────────────────────────────
//
//  THE CONTENT HANDLER IS ALWAYS CALLED, on every path. If an extension fails to
//  call it, iOS waits for the timeout and then shows the original notification —
//  so a crash or an early return here does not lose the notification, it DELAYS
//  it by up to 30 seconds. Every failure below therefore falls through to
//  delivering the unmodified content immediately. A notification with no picture
//  is a small loss; a notification that arrives half a minute late is a real one.
//

#import "NotificationService.h"

// FCM caps notification images at 1 MB, so anything materially larger is a
// misconfiguration rather than a picture worth waiting for. Bounded defensively
// because this runs in an extension with a hard wall-clock limit.
static const long long kMaxImageBytes = 5LL * 1024 * 1024;
// Well inside the ~30s the system allows, leaving room for the attachment write.
static const NSTimeInterval kDownloadTimeout = 12.0;

@interface NotificationService ()

@property (nonatomic, strong) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;
@property (nonatomic, strong) NSURLSessionDataTask *task;
// Guards against delivering twice: `serviceExtensionTimeWillExpire` can fire
// while the download's completion block is already running.
@property (nonatomic, assign) BOOL delivered;

@end

@implementation NotificationService

/**
 * The image URL, from wherever it actually is.
 *
 * Four places are checked because the payload shape is not ours alone to decide:
 *
 *   fcm_options.image   what FCM writes for `apns.fcm_options.image`. A dictionary
 *                       normally, but a JSON STRING in some delivery paths, so
 *                       both are handled.
 *   image               our own data-payload key (src/push.js sets `data.image`
 *                       as well, for the Android JS handler and the in-app list).
 *                       This is the one most likely to be present.
 *   imageUrl            tolerated so a future caller using the camelCase name
 *                       does not silently lose the picture.
 *
 * Returns nil unless the result is an https URL. http is refused rather than
 * attempted: App Transport Security would block it anyway, and failing here is
 * instant while failing there costs the timeout.
 */
- (NSURL *)imageURLFromUserInfo:(NSDictionary *)userInfo {
  NSMutableArray<NSString *> *candidates = [NSMutableArray array];

  id fcmOptions = userInfo[@"fcm_options"];
  if ([fcmOptions isKindOfClass:[NSDictionary class]]) {
    id value = ((NSDictionary *)fcmOptions)[@"image"];
    if ([value isKindOfClass:[NSString class]]) [candidates addObject:value];
  } else if ([fcmOptions isKindOfClass:[NSString class]]) {
    NSData *data = [(NSString *)fcmOptions dataUsingEncoding:NSUTF8StringEncoding];
    if (data) {
      id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      if ([parsed isKindOfClass:[NSDictionary class]]) {
        id value = ((NSDictionary *)parsed)[@"image"];
        if ([value isKindOfClass:[NSString class]]) [candidates addObject:value];
      }
    }
  }

  for (NSString *key in @[ @"image", @"imageUrl" ]) {
    id value = userInfo[key];
    if ([value isKindOfClass:[NSString class]] && ((NSString *)value).length > 0) {
      [candidates addObject:value];
    }
  }

  for (NSString *candidate in candidates) {
    NSURL *url = [NSURL URLWithString:candidate];
    if (url && [url.scheme.lowercaseString isEqualToString:@"https"] && url.host.length > 0) {
      return url;
    }
  }
  return nil;
}

/**
 * A file extension the system will accept.
 *
 * UNNotificationAttachment identifies the resource type from the file's
 * extension, which is why Firebase's documentation insists the image URL have a
 * valid one. A storage URL with a query string, or none at all, is common — so
 * the response's MIME type is used as the fallback, and jpg as the last resort.
 */
- (NSString *)fileExtensionForURL:(NSURL *)url response:(NSURLResponse *)response {
  NSSet *known = [NSSet setWithArray:@[ @"jpg", @"jpeg", @"png", @"gif", @"webp" ]];
  NSString *fromPath = url.pathExtension.lowercaseString;
  if (fromPath.length > 0 && [known containsObject:fromPath]) return fromPath;

  NSString *mime = response.MIMEType.lowercaseString;
  if ([mime isEqualToString:@"image/png"]) return @"png";
  if ([mime isEqualToString:@"image/gif"]) return @"gif";
  if ([mime isEqualToString:@"image/webp"]) return @"webp";
  if ([mime isEqualToString:@"image/jpeg"] || [mime isEqualToString:@"image/jpg"]) return @"jpg";
  return @"jpg";
}

/** Deliver exactly once, whatever happens. */
- (void)deliverOnce {
  @synchronized (self) {
    if (self.delivered) return;
    self.delivered = YES;
  }
  if (self.contentHandler && self.bestAttemptContent) {
    self.contentHandler(self.bestAttemptContent);
  }
}

- (void)didReceiveNotificationRequest:(UNNotificationRequest *)request
                   withContentHandler:(void (^)(UNNotificationContent *_Nonnull))contentHandler {
  self.contentHandler = contentHandler;
  self.bestAttemptContent = [request.content mutableCopy];
  self.delivered = NO;

  NSURL *imageURL = [self imageURLFromUserInfo:request.content.userInfo];
  if (imageURL == nil) {
    // Nothing to add. Deliver straight away rather than sitting here — the push
    // only reaches this extension at all when `mutable-content` is set, and the
    // backend sets that only alongside an image, so this is the unexpected case.
    [self deliverOnce];
    return;
  }

  NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
  config.timeoutIntervalForRequest = kDownloadTimeout;
  config.timeoutIntervalForResource = kDownloadTimeout;
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config];

  __weak __typeof(self) weakSelf = self;
  self.task = [session dataTaskWithURL:imageURL
                     completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    // `strongSelf`, not a redeclared `self`. Shadowing `self` inside a block is a
    // common idiom and compiles, but it draws a shadow warning on some settings
    // and this file cannot be compiled on the machine it was written on — so the
    // unambiguous form is worth the extra characters.
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    if (strongSelf == nil) return;

    // Every early return below ends in deliverOnce, so the notification is shown
    // with its text intact. That is the whole contract of this file.
    if (error != nil || data.length == 0) { [strongSelf deliverOnce]; return; }

    if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
      NSInteger status = ((NSHTTPURLResponse *)response).statusCode;
      if (status < 200 || status > 299) { [strongSelf deliverOnce]; return; }
    }
    if ((long long)data.length > kMaxImageBytes) { [strongSelf deliverOnce]; return; }

    NSString *extension = [strongSelf fileExtensionForURL:imageURL response:response];
    NSString *name = [NSString stringWithFormat:@"astrowani-%@.%@", [[NSUUID UUID] UUIDString], extension];
    NSURL *fileURL = [[NSURL fileURLWithPath:NSTemporaryDirectory()] URLByAppendingPathComponent:name];

    NSError *writeError = nil;
    if (![data writeToURL:fileURL options:NSDataWritingAtomic error:&writeError]) {
      [strongSelf deliverOnce];
      return;
    }

    NSError *attachError = nil;
    UNNotificationAttachment *attachment = [UNNotificationAttachment attachmentWithIdentifier:@"astrowani-image"
                                                                                          URL:fileURL
                                                                                      options:nil
                                                                                        error:&attachError];
    if (attachment != nil && attachError == nil) {
      strongSelf.bestAttemptContent.attachments = @[ attachment ];
    } else {
      // The system did not take the file, so nothing will move it. Clean up
      // rather than leaving it in the container's temp directory.
      [[NSFileManager defaultManager] removeItemAtURL:fileURL error:nil];
    }

    [strongSelf deliverOnce];
  }];
  [self.task resume];
}

- (void)serviceExtensionTimeWillExpire {
  // Out of time. Show what we have — the text — instead of letting the system
  // deliver the untouched original after a visible delay.
  [self.task cancel];
  [self deliverOnce];
}

@end
