# Wording to match the new retention rules (decided 2026-09-25)

The apps and server now behave like this. Your website must say the same, or the delete-account
page contradicts what actually happens.

## What actually happens when someone deletes their account
| Data | What happens |
|---|---|
| Profile, name, birth details, photos, addresses, reviews, voice notes, support tickets | **Erased** |
| **Chat messages** | **Kept** (safety, dispute handling, legal). Phone numbers typed in chat are already stored as stars. |
| **Call recordings and transcripts** | **Kept for 90 days**, then the audio and transcript are deleted automatically |
| Payment, wallet, order and earnings records | **Kept** (tax and accounting law) |
| A scrambled fingerprint of the phone number and which free offers it used | **Kept**, to stop the free call / free chat being claimed again |
| A record that a message or call contained contact details (the flagged sentence) | **Kept** with the safety records |

## 1. `astrowani.com/delete-account/` -- replace the "What we erase / What we keep" wording
Replace any line saying chats are erased with:

> **What we erase:** your profile, name, birth details, photos, saved addresses, reviews, voice
> notes and support conversations.
>
> **What we keep, and why:**
> - **Chat messages** between you and astrologers, kept for safety, to handle disputes and to meet
>   legal obligations.
> - **Call recordings** (if a call was recorded), kept for 90 days for safety and dispute handling,
>   then deleted automatically.
> - **Payment, wallet and order records**, kept as required by tax and accounting law.
> - **A scrambled (hashed) version of your phone number** and a note of which one-time free offers it
>   has used, kept to prevent the same offer being claimed again after re-registering. It cannot be
>   turned back into your number.
>
> Wallet balances are forfeited when an account is deleted.

## 2. Privacy Policy -- add (or replace the matching paragraph)
> **Chats and calls.** Messages exchanged with astrologers are stored and may be reviewed to keep
> the service safe and to resolve disputes. Calls may be recorded (audio only) and transcribed for
> the same purposes; recordings are kept for 90 days. Phone numbers, emails and similar contact
> details shared in chat are hidden automatically and may be flagged for review. Chats and recordings
> are retained even after an account is deleted, for as long as needed for safety, disputes and legal
> obligations.
>
> **Free-offer protection.** To stop free offers being claimed repeatedly, we keep a hashed
> (irreversible) version of a phone number and the offers it used, including after account deletion.

## 3. Terms & Conditions -- add
> Calls and chats on Astrowani may be recorded and reviewed for safety, quality and dispute
> resolution. Sharing personal contact details (phone numbers, email, social handles, payment ids) to
> move a consultation outside Astrowani is not allowed and may lead to account action.

## Also worth checking
- **Google Play Data safety form:** "Users can request data deletion" stays **Yes**, but you must
  also declare that **some data is retained after deletion** (chats, recordings, transactions) and
  why (fraud prevention / security, legal compliance).
- If you keep chat messages for a fixed period rather than "as long as needed", tell me the period
  and I will add an automatic purge; today nothing deletes chat messages.
