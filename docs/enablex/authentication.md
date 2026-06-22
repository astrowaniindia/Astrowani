# EnableX Authentication

EnableX uses a dual-tier authentication model to balance security and ease of use.

## Authentication Flow
The flow consists of two main parts:
1. **Server-to-Server (REST API):** Your backend authenticates with EnableX to create rooms and generate client tokens.
2. **Client-to-EnableX (SDK):** Your mobile/web app uses a generated token to join a session.

### Step-by-Step Flow:
1. **Request:** Your Client App requests a session from your Backend.
2. **Room Creation (Optional):** Your Backend calls the EnableX REST API to create a room (if not already created).
3. **Token Generation:** Your Backend calls the EnableX Token API to generate a JWT for that Room and User.
4. **Token Delivery:** Your Backend returns the JWT Token to your Client App.
5. **Session Join:** The Client SDK uses this Token to establish a connection with the EnableX Video Cloud.

## Credentials
### App ID & App Key
- **App ID:** A unique identifier for your project/application. Used as the "username" in Basic Auth.
- **App Key:** A secret key associated with your App ID. Used as the "password" in Basic Auth.
- These are obtained from the [EnableX Portal](https://portal.enablex.io/).

## Tokens (JWT)
Tokens are short-lived credentials that authorize a specific user to join a specific room.
- **Validity:** Typically valid for 30 minutes to a few hours (configurable).
- **Scope:** Bound to a `room_id`.
- **User Identity:** Can include `user_ref` to identify the participant in your own system.

## Security Considerations
- **NEVER EXPOSE APP KEY IN CLIENT CODE:** The App Key must remain strictly on your server. Exposing it allows anyone to manage your rooms and incur costs.
- **HTTPS Only:** All REST API calls and token transfers must happen over HTTPS.
- **Token Expiry:** Always set a reasonable TTL (Time To Live) for tokens to minimize the window of misuse if a token is intercepted.
- **Server-Side Validation:** Your backend should validate user permissions before requesting a token from EnableX.
- **Role Management:** Use tokens to define participant roles (Moderator vs. Participant) to control room permissions.
