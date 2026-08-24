#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <PushKit/PushKit.h>

// PKPushRegistryDelegate is what makes iOS deliver VoIP pushes to this app. Its two
// callbacks live in AppDelegate.mm; the incoming-push one is where the app satisfies
// iOS's requirement that every VoIP push immediately report a call to CallKit.
@interface AppDelegate : RCTAppDelegate <PKPushRegistryDelegate>

@end
