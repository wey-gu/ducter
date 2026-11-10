# 54. Credentials for errands: sign-ins, cards and travel details for a personal AI

Date: 2026-11-11. Question (the author): "Did we build credential management like Muse's? E.g. later I
ask it to book hotels, flights, buy things — all kinds of scenarios… I want many features to work
elegantly on phone, iPad, Android." `research/25` already covers browser credentials for persistent
profiles (Muse `authd`, injection while the agent is paused, Stripe Link single-use cards, 1Password
autofill, browser-use, agent-browser, passkeys) and proposes `credd` plus "Logged-in sites". This
report does not repeat it. It adds what is new since 2026-11-08 and what errands (booking, buying,
travel) need beyond social accounts: payment rails, 3-D Secure, travel documents, and the law.

Method. Web search and page reads only. No account, no sign-up, no purchase, no third-party code run,
no real card number used. I read these pages in full: Stripe's Link CLI "Enable agents to spend"
docs, Stripe's "Giving agents the ability to pay" post, Stripe's Muse newsroom post, OpenAI's
Delegated Payment Spec, 1Password's "1Password for Claude" (2026-07) and "1Password for Agents"
(2026-10) press releases, 1Password's Meta Muse partner page, Browserbase's 2026-10-22 changelog,
Bitwarden's 2026-05-05 agent post, Skift's Muse travel test, a Search Engine Journal report on
Amazon v. Perplexity, and the PCI SSC FAQ 1280. **OpenAI's help article on the ChatGPT cloud browser
returned 403**, so its claims come from search snippets of that page. Everything else comes from
search snippets and secondary coverage and is tagged that way. Primary texts of GDPR, PIPL and the
EU payment rules were **not** re-fetched; I cite them from their known wording, and they need a
legal read before anything ships. Nowledge Mem was not reachable from this session (the MCP server
returned 502), so prior notes were not searched.

Tags: **VERIFIED** = I read it on the page cited. **DOCUMENTED** = the vendor or a legal source says
so per a snippet or secondary report; not tested. **INFERRED** = my reading; may be wrong.

---

## 1. Meta Muse since research/25

- **1Password is now live for Muse, not "coming soon".** 1Password's partner page says "1Password
  fills your password or one-time code without showing it to Muse"; connecting "doesn't give Muse
  access to all your vaults"; you choose which logins Muse may use; "1Password for Agents is included
  in all Individual and Families plans"; `1password.eu` and `1password.ca` accounts "are not yet
  supported". Examples named: airline accounts, Walmart, Costco, Google Calendar [VERIFIED:
  https://1password.com/partners/meta-muse]. Note that it fills **OTP codes too**, which research/25
  had as an open question.
- **Payments.** Stripe: Muse checks out "instantly" at more than 1 million Link merchants with the
  user's saved method; elsewhere Link issues "a one-time virtual card limited to the purchase amount
  the user pre-approved"; the final amount is approved in the chat interface; Muse "cannot directly
  access" card numbers; US consumers only [VERIFIED: https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link].
  Stripe says Muse is the first agent with Link purchase protections (damage, loss, price drop,
  returns) [DOCUMENTED: https://stripe.com/blog/helping-personal-agents-shop-more-intelligently-and-reliably-with-link].
  Shop Pay is still "coming" [DOCUMENTED: https://thepaypers.com/payments/news/meta-launches-personal-ai-agent-with-stripe-powered-checkout].
- **Travel.** Flights go through a direct connection to **Duffel** ("live, bookable" inventory,
  500+ airlines) paid with "a virtual card through Stripe"; hotels are shopped in the browser on
  consumer sites such as Expedia and Hotels.com [VERIFIED: https://skift.com/2026/09/09/meta-says-its-muse-agent-books-travel-heres-what-that-actually-means/].
  **No source says how Muse collects or stores passport numbers, loyalty numbers or traveler
  details** (searched; nothing found). Duffel is an API for businesses that sell flights, so this
  path assumes Meta is the seller of record or agent of record; an individual cannot copy it
  [INFERRED].
- **Liability.** Muse's supplemental terms reportedly put "all risk of financial loss" on the user
  and cap Meta's liability at the greater of $250 or fees paid [DOCUMENTED, secondary snippet; terms
  page not read]. Amazon still blocks Muse (research/25).

## 2. OpenAI: cloud browser, confirmations, ACP

- **Sign-in.** The ChatGPT cloud browser keeps its own cookies and logged-in sessions, separate from
  the user's devices; credentials go through a separate secure form; "an additional review model
  checks the request and where your information will be entered" for phishing; the session persists
  "until it expires or the user clears that site's browser data" (Settings > Cloud browser > Browser
  data); the agent asks the user to take over when stuck [DOCUMENTED: help.openai.com/en/articles/20001280,
  **page 403 to fetch**, quoted via search snippets and https://macstories.net/stories/hands-on-with-chatgpts-new-cloud-browser-feature/].
- **Confirmations.** ChatGPT "is designed to ask for confirmation before taking an action that may
  be difficult to undo or create a financial, legal, account, or other real-world commitment"; new
  websites need permission by default ("Always ask") [DOCUMENTED, same help page via snippet].
- **ChatGPT Finances** (2026-05, US Pro) is read-only through Plaid: it "cannot move money, pay
  bills… make trades" [DOCUMENTED: https://help.openai.com/en/articles/20001222-finances-in-chatgpt].
  OpenAI keeps reading and paying apart.
- **ACP and the Delegated Payment Spec.** OpenAI calls the PSP's `delegate_payment` endpoint with an
  allowance: `reason: one_time`, `max_amount`, `expires_at`, `merchant_id`, `checkout_session_id`.
  The returned token is single-use and "outside of PCI scope"; OpenAI "is not the merchant of
  record"; direct integration is "only for PSPs or PCI DSS Level 1 merchants using their own vaults";
  Stripe's Shared Payment Token is the first compatible implementation [VERIFIED:
  https://developers.openai.com/commerce/specs/payment]. What the model sees is not stated there.
- **Instant Checkout was scaled back in 2026-03**: purchases moved to merchant "Apps" in ChatGPT;
  about 30 Shopify merchants had taken part by 2026-02; ACP survives as discovery plumbing
  [DOCUMENTED: https://www.retailgazette.co.uk/blog/2026/03/openai-pivots-chatgpt-shopping-strategy-after-instant-checkout-underwhelms/,
  https://www.digitalcommerce360.com/2026/03/06/openai-shifts-checkout-plans-agentic-commerce-strategy/amp/].
  Lesson: merchant-side protocols depend on merchant adoption; the browser plus a card still does
  most real errands [INFERRED].

## 3. Perplexity Comet and shopping

- **Payments.** "Buy with Pro" (2024) had Perplexity as intermediary; the 2025-11 relaunch with
  PayPal "Instant Buy" makes PayPal merchants the merchant of record, paying with details stored in
  the user's PayPal account [DOCUMENTED: https://www.engadget.com/ai/perplexity-announces-its-own-take-on-an-ai-shopping-assistant-210500961.html,
  https://www.shopifreaks.com/perplexity-to-make-its-agentic-shopping-available-to-everyone-for-free/].
- **Logins.** Comet runs in the user's own browser; Perplexity says Amazon credentials stay on the
  user's device [DOCUMENTED: https://www.insurancejournal.com/news/national/2025/11/05/846503.htm].
  Perplexity is a 1Password for Agents partner [VERIFIED, §5].
- **The legal lesson (new).** In Amazon v. Perplexity, Judge Chesney granted a preliminary
  injunction (reported 2026-03-10) barring Comet from password-protected Amazon systems, citing
  "strong evidence" Comet accessed accounts "with the Amazon user's permission but without
  authorization by Amazon" [VERIFIED: https://www.searchenginejournal.com/amazon-wins-preliminary-injunction-against-perplexitys-comet/569256/].
  The owner's consent does not equal the site's authorization under the CFAA, at least at this
  preliminary stage. A self-hosted agent acting from the owner's own machine is not obviously
  different [INFERRED].

## 4. Hosted browsers: how sessions persist and secrets stay out of the model

- **Browserbase + 1Password for Agents** (changelog 2026-10-22): the agent requests "a specific
  login"; the user approves or denies in 1Password on their own device; 1Password autofills and
  submits through Browserbase's extension system and removes the values; "Credentials never pass
  through your application, models, or logs"; optional zero data retention and no recording
  [VERIFIED: https://browserbase.com/changelog/1password-for-agents]. A second path uses a 1Password
  service account and the SDK, which does pass the secret to the developer's code [DOCUMENTED:
  https://docs.browserbase.com/integrations/1password/quickstart].
- **Anchor Browser.** Profiles persist cookies, localStorage and cache (`persist: true` on first
  login, reuse by name) and "do not store credentials or re-authenticate automatically"; a separate
  managed-authentication mode runs the sign-in flow itself [DOCUMENTED:
  https://docs.anchorbrowser.io/essentials/managed-authentication].
- **Steel Credentials API** (beta): `POST /v1/credentials` stores logins per organization; a
  `credentials` field on `POST /v1/sessions` injects them "without exposing them to agents or the
  page" [DOCUMENTED: https://docs.steel.dev/overview/credentials-api].
- Convergence with research/25 still holds: session in a profile, secret injected by a component the
  model cannot read. New: **approval moves to the owner's own phone or desktop app of the vault**,
  not to the agent's chat [INFERRED from §4–5].

## 5. Password managers

- **1Password for Claude** (2026-07-16): per **task**, not per fill, one biometric prompt; access
  lasts for that session only; password and MFA code "never accessible to the model, its context, or
  Anthropic's systems"; injection "outside the agent's view"; it brokers several sites in one task;
  it scans the page after each fill and clears values if submission fails; **Mac only**; payment
  cards and identity details "planned for after launch" [VERIFIED:
  https://1password.com/press/2026/july/1password-for-claude].
- **1Password for Agents** (2026-10-22): the agent proves itself with "a unique digital key"; the
  person sees which credential and why and approves on their own device; partners named include
  Muse, Claude Duet, ChatGPT Work, Grok Bot, Perplexity, Browser Use, Browserbase; nothing on cards,
  identities, iOS/Android, or audit [VERIFIED: https://1password.com/press/2026/october/1password-for-agents-trust-layer-personal-ai-agents].
  It is a partner programme: an open-source self-hosted agent is not listed, and no public way to
  join was found [INFERRED]. Several third-party reports of GA dates conflict; ignore them.
- **1Password SDK / service accounts** read secrets into the caller's process at runtime: fine for
  API keys, wrong for a model-driven browser because the secret enters agent-controlled memory
  [DOCUMENTED: https://blog.1password.com/service-accounts-sdks-agentic-ai; risk INFERRED].
- **Bitwarden** (2026-05-05): MCP server for vault management, with a strong recommendation to use a
  local LLM; **Agent Access SDK**, open source, "just-in-time" human-approved access where the agent
  "does not see the vault contents in plain text, but rather credentials are injected", still "in
  alpha"; Secrets Manager for machine secrets with audit logs [VERIFIED:
  https://bitwarden.com/blog/how-bitwarden-helps-secure-agentic-ai-access-to-your-credentials/].
  The Agent Access SDK is the only open-source vault-to-agent path found; it fits a self-hosted
  product best [INFERRED].
- **Apple Passwords.** Third-party apps can be AutoFill credential providers
  (`ASCredentialProviderViewController`) and, from iOS/macOS 26, import/export through the FIDO
  Credential Exchange Protocol (`ASCredentialExportManager` / `ASCredentialImportManager`); there is
  no API for an app to read the user's Passwords items [DOCUMENTED:
  https://9to5mac.com/2025/06/13/ios-26-passkeys-password-transfer/, https://www.corbado.com/blog/wwdc25-passkeys-os26.md;
  "no read API" INFERRED from Apple's AuthenticationServices design, docs not fetched]. So Ducter
  cannot draw on Apple Passwords for a task; the owner fills it by hand in a live view.
- **Chrome / Google Wallet.** Chrome's enhanced autofill fills passport, driver's licence and
  vehicle details, is off by default and "will always ask for confirmation before filling"; since
  2026-06 it also fills from Google Wallet on Android and iOS, including the Known Traveler Number
  [DOCUMENTED: https://blog.google/products/chrome/enhanced-autofill/,
  https://www.androidcentral.com/apps-software/chromes-enhanced-autofill-features-arrive-to-simplify-your-holiday-planning].
  No agent API [INFERRED].

## 6. Passkeys

- The CDP `WebAuthn` domain is experimental and creates **virtual authenticators for testing**;
  Chromium only [DOCUMENTED:
  https://chromium.googlesource.com/devtools/devtools-frontend.git/+/HEAD/node_modules/devtools-protocol/pdl/domains/WebAuthn.pdl].
  A virtual authenticator holds a new software key, not the owner's passkey, which lives in iCloud
  Keychain, Google Password Manager or 1Password and needs the owner's biometric. Registering an
  agent-owned passkey on the owner's account would add a credential the owner cannot see on their
  devices [INFERRED].
- Right handling (unchanged from research/25, now also confirmed by the errand flows above): the
  owner signs in once in a live view of Ducter's browser (on a Mac host, phone hybrid QR works); the
  session cookie is reused; when it expires, Ducter asks again [INFERRED].

## 7. Payment rails for agents, and who can use them

| Rail | What the agent gets | Approval | Who can use it today |
|---|---|---|---|
| **Stripe Link agent wallet + `link-cli`** | One-time virtual card (scoped to amount, merchant name and URL; default `valid_until` 12 h), recurring card with a per-period cap, Shared Payment Token, or Link Pay token | Every spend request is approved by the consumer in the Link web or iOS/Android app within **30 min**; `--context` ≥ 100 chars is what they read; raising the amount needs re-approval | **US and Canadian consumers** with a Link account; the agent is OAuth-authorised with scope `payment_methods.agentic` [VERIFIED: https://docs.stripe.com/agentic-commerce/link-cli/use-link-wallet-pay-online]. Whether a self-hosted open-source agent may register is not stated; sign-up is at link.com/agents [INFERRED: needs a trial] |
| **Privacy.com** | Single-use or merchant-locked virtual card with spend limit, pausable; API and an MCP server | Owner creates the card or lets the agent create it under limits | **US individuals**, free plan 12 new cards a month [DOCUMENTED: https://developers.privacy.com/docs/mcp-server, https://www.privacy.com/llms.txt] |
| **Stripe Issuing** | Any virtual card with controls | Programmatic | Businesses only [DOCUMENTED: https://stripe.com/blog/giving-agents-the-ability-to-pay; INFERRED for individuals] |
| **ACP / Shared Payment Token** | Single-use token scoped to seller, amount, expiry | Platform's UI | Agent platforms and merchants on Stripe; not an individual [VERIFIED §2] |
| **Visa Intelligent Commerce** | Agent-specific token after cardholder step-up, passkey-authenticated instructions | Issuer/passkey | Through enrolled platforms and issuers; "in the process of development and deployment"; MCP server for developers [DOCUMENTED: https://developer.visa.com/use-cases/visa-intelligent-commerce-for-agents] |
| **Mastercard Agent Pay** | Agentic token per agent, Verifiable Intent | Passkeys at issuers | Live transactions in LATAM (2026-03), Europe, Australia through partners [DOCUMENTED: https://www.mastercard.com/news/latin-america/en/newsroom/press-releases/pr-en/2026/march/mastercard-advances-agentic-payments-in-latin-america-and-the-caribbean-with-live-transactions-completed-across-the-region] |
| **Google AP2 / UCP** | Signed Intent → Cart → Payment mandates; human-present and human-not-present | User signs the Cart (or a bounded Intent) | Protocol open; Gemini first (announced at I/O 2026), merchants via UCP [DOCUMENTED: https://techcrunch.com/2025/09/16/google-launches-new-protocol-for-agent-driven-purchases, https://www.pymnts.com/news/2026/google-debuts-universal-protocol-for-agentic-commerce/] |
| **PayPal Agent Toolkit / MCP** | Merchant APIs (orders, invoices, refunds) | n/a | Developers with a PayPal business account; it is a selling tool, not a consumer wallet [DOCUMENTED: https://developer.paypal.com/community/blog/paypal-agentic-ai-toolkit/] |
| **Apple Pay** | Nothing | Per payment, biometric on the owner's device | No agent path found [DOCUMENTED absence: https://forkast.news/apple-homeview-puts-an-agent-in-every-room-and-a-human-at-every-checkout/] |
| **The owner's own card**, filled by a vault | The real PAN in the page | Ducter's own gate; 3DS by the issuer | Anyone, anywhere [INFERRED] |

Notes. Link's `retrieve --include card` prints full PAN, CVC and billing address to stdout unless
`--output-file` is given (file `0600`, stdout then shows only brand, last 4 and expiry); Stripe warns
this would land "in model context, agent transcripts, log aggregation" [VERIFIED, Link docs]. A
3-D Secure challenge comes back as `requires_action` / `three_d_secure` with an `action_url` for the
customer, `resolution: auto_resume` [VERIFIED, same]. Outside the US and Canada no consumer agent
wallet was found; Alipay, WeChat Pay and EU bank disposable cards were **not researched** [gap].

## 8. Law and compliance

- **PCI DSS** applies to entities that store, process or transmit cardholder data for payment
  (merchants, processors, service providers). A person keeping their own card in their own
  software is not such an entity, so Ducter self-hosted is outside it; Ducter-the-project never
  touches anyone's card [INFERRED; PCI SSC scope wording not fetched]. Still adopt its strictest
  rule as a design rule: card verification codes "can't be kept once the transaction they were
  collected for is authorized", even encrypted; only issuers may store SAD [VERIFIED:
  https://www.pcisecuritystandards.org/faqs/1280/]. A hosted Ducter (server mode run for others)
  would change this [INFERRED].
- **PSD2 SCA / 3-D Secure.** SCA assumes a human payer; there is no dedicated EU regime for agentic
  payments; delegated authentication needs issuer agreements and the platform takes liability;
  disputes turn on documented consent, mandate limits and whether SCA ran [DOCUMENTED:
  https://www.osborneclarke.com/insights/agentic-payments-new-challenge-europes-payments-ecosystem,
  https://www.taylorwessing.com/en/insights-and-events/insights/2026/02/agentic-ai-in-payments].
  For Ducter: the owner completes every 3DS/SCA challenge live; Ducter keeps the consent record.
- **Card network rules.** Visa and Mastercard are moving agents onto per-agent tokens with
  Verifiable Intent (§7). A plain card typed by a browser agent looks like a normal card-not-present
  transaction; chargeback rights stay the cardholder's, but an "I didn't authorise this" dispute is
  weak if the owner approved it [INFERRED, not legal advice].
- **Site terms.** Amazon v. Perplexity (§3): owner consent is not site authorisation. Ducter should
  identify itself honestly and respect sites that refuse agents (research/25's Amazon lesson).
- **GDPR.** Art. 87 lets member states set conditions for processing a national identification
  number; Art. 9 does not list passports, but they are high-risk data in practice. A person using a
  self-hosted tool for their own errands falls under the household exemption (Art. 2(2)(c)); booking
  for family or friends is still household, but a shared server run for others is not
  [DOCUMENTED from the regulation's text, not re-fetched; applicability INFERRED].
- **China PIPL.** Art. 28 lists "specific identity", "financial accounts" and "individual location
  tracking" as sensitive personal information; Art. 29 requires **separate consent** [DOCUMENTED:
  https://www.pcpd.org.hk/english/data_privacy_law/mainland_law/mainland_law.html (points to the NPC
  translation); exact wording not fetched]. Art. 72 excludes processing by natural persons for
  personal or family affairs [DOCUMENTED, same law; not fetched]. Design to the stricter reading
  anyway: ask once, separately, before saving ID or card data.
- **Travel data the law requires.** US Secure Flight needs full name as on ID, date of birth and
  gender at booking (before ticketing); Redress and Known Traveler Number are optional [DOCUMENTED:
  https://www.aa.com/secureflight, https://pro.delta.com/content/agency/us/en/policy-library/government-tsa/secure-flight-passenger-data--sfpd--faqs.html].
  International flights need passport data for APIS (and similar systems elsewhere) before
  departure [DOCUMENTED, general knowledge; APIS page not found in this search].

## 9. 2FA and one-time codes on errands

- Peers ask the owner live: ChatGPT asks the user to take over; Manus says "Take Over" (research/25);
  Link returns 3DS as an action URL for the customer (§7).
- **Vault-filled OTP is now real**: 1Password fills "your password or one-time code" for Muse and
  "MFA one-time code" for Claude without the model seeing it [VERIFIED §1, §5]. So TOTP seeds held
  in the owner's vault, filled under the owner's approval, are the clean path; storing seeds in
  Ducter collapses two factors into the box that already holds the session [INFERRED].
- **SMS and email codes**: Muse filters OTPs and reset links out of model-visible email
  (research/25). Airline and bank codes go to the owner's phone; on iPhone they are not readable by
  third-party apps, on Android SMS reading needs a default-SMS role or the SMS User Consent API
  [INFERRED from platform rules; not re-checked]. Ask the owner to type or approve, every time.

## 10. Travel profiles

- What business travel tools store: legal name, date of birth, passport details, Known Traveler /
  PreCheck number, frequent-flyer numbers, seat and meal preferences, emergency contact, default
  payment method [DOCUMENTED: https://navan.com/resources/glossary/traveler-profile,
  https://www.navan.com/privacy]. TripIt's current fields were not confirmed (only a 2015 source).
- Consumers already keep these in Google Wallet (passport, KTN, filled with confirmation, §5), in
  airline accounts, and in Apple Wallet. Seat and meal preferences are ordinary memory, not secrets
  [INFERRED].

## Comparison

| Product | Where the secret lives | What the model sees | Payment approval | 2FA | Revocation / audit |
|---|---|---|---|---|---|
| **Muse** | `authd` (research/25) or the owner's 1Password; card in Link | Neither password nor OTP; not the card number | Final amount in chat; Link single-use card scoped to it | 1Password fills OTP; email OTPs filtered | Disconnect 1Password; Muse audit trail [§1] |
| **ChatGPT cloud browser** | Not stored; session cookies kept per site | Not the credentials (secure form) | Confirmation in chat before financial commitments | User types code / takes over | Clear per site in Settings [§2] |
| **ACP / Instant Checkout** | PSP vault (Stripe) | Not the card | ChatGPT UI; token capped by `max_amount`, `expires_at` | Merchant/PSP | Single-use token [§2] |
| **Comet** | User's device, PayPal | Unclear | PayPal checkout | User | Enjoined on Amazon [§3] |
| **Browserbase + 1Password** | Owner's 1Password | Nothing | n/a | n/a (OTP fill elsewhere) | Approve per request on own device; ZDR option [§4] |
| **Steel / Anchor** | Org vault / profile | Not the credential | n/a | n/a | Per org / per profile [§4] |
| **1Password for Claude** | 1Password | "Knows it used your login" | Cards "planned" | Fills MFA code | Per-task grant, session only [§5] |
| **Bitwarden Agent Access** | Bitwarden | Not plaintext (alpha) | n/a | n/a | Just-in-time approval [§5] |
| **Link `link-cli`** | Link | Brand, last 4, expiry if `--output-file` | Every spend in the Link app, 30 min | 3DS `action_url` | Cancel spend request; history [§7] |
| **Privacy.com** | Privacy | Card if the agent reads it | Card limits | Issuer | Pause/close card [§7] |

## Implications for Ducter

1. **Answer to the author: not yet.** Ducter has the design for sessions and sign-ins (research/25,
   `credd` and "Logged-in sites"), not payments, travel details, or vault approvals from the phone.
   Errands need three stores kept apart: **session** (browser profile), **secret** (password, OTP,
   card), **private details** (passport, KTN, loyalty, address, preferences).
2. **Secrets: defer to the owner's password manager first, keep `credd` as the fallback.** Order:
   Bitwarden Agent Access SDK (open source, fits self-hosted; alpha, so trial first); 1Password for
   Agents when a public path for self-hosted agents exists (today it is a partner list); local
   `credd` for people with neither. Apple Passwords and Google Password Manager cannot be read by
   Ducter, so for those owners the default is "sign in yourself once, here".
3. **Fill by reference, always.** Tools take `{item_ref, field}`, never values; the gate types into
   the page after an origin check, pauses the agent while filling, scrubs output (research/25 §3.2).
   Apply this to cards: the model gets brand, last 4, expiry month, never PAN or CVC. When using
   `link-cli`, always `--output-file` into the gate's private directory, never stdout.
4. **A Go card for every payment, on the phone.** It names merchant and domain, amount and currency
   (with taxes and fees if known), what is bought, card brand and last 4, and whether it is a
   single-use card. One tap approves; the approval is bound to that amount and merchant; a higher
   total needs a new card. Where Link is available (US/CA), the Link app's own approval can replace
   or follow Ducter's, but not both by default: one decision per purchase.
5. **First use per new site is an OK, then remembered.** First sign-in or first payment on a new
   domain asks "OK to use your login / card on booking.example?" Later uses in a task the owner
   started are pre-approved for sign-in only; **payments always ask** (matches ChatGPT and Muse).
6. **CVC is never stored.** Ask for it live when a site needs it (the owner types it in the live view
   or in the Go card's secure field, filled once, not kept), or use a single-use card that carries
   its own CVC. This is PCI's SAD rule adopted as a design rule.
7. **3DS, SCA, OTP and passkeys are live, owner-only steps.** Ducter raises a needs-you card that
   opens the live view on whichever device the owner holds (phone, iPad, Android, Mac); it never
   reads SMS; it never registers its own passkey on the owner's account. Vault-filled TOTP only when
   the owner's vault does it under their approval.
8. **Travel details are private, not secret.** Store passport number and expiry, nationality, KTN,
   Redress, loyalty numbers and seat/meal preferences in an encrypted "Travel details" profile per
   traveller (owner, family), filled by reference like secrets but visible to the owner in plain
   UI. Saving them needs one **separate consent** per category (PIPL Art. 29 style), and every fill
   is logged. Ask for passport data only when a booking needs it (international flight, some
   hotels); never paste it into chat or memory.
9. **Audit you can read.** Each errand logs `credential_used`, `card_used{last4, merchant, amount,
   approval_id}`, `travel_detail_used{field, site}`, `3ds_completed`, with no values. The owner sees
   it per task and per site, and can revoke a site, a card or a travel field in one place.
10. **Be honest about rails and sites.** Offer Link single-use cards to US/CA owners and Privacy.com
    to US owners; elsewhere the default is the owner's own card filled by the vault with a Go card.
    Respect sites that ban agents (Amazon) instead of hiding; say so at the moment, with "open it
    for me" as the fallback. Flights through APIs like Duffel need a business; Ducter books in the
    browser on the airline's or OTA's site.
11. **Next checks before design.** A trial of `link-cli` OAuth with a self-hosted agent in test mode
    (`--test`); a read of Bitwarden Agent Access SDK's repository; whether 1Password for Agents will
    admit open-source agents; Alipay/WeChat Pay and EU disposable cards; the primary texts of PIPL
    Art. 28–29/72 and GDPR Art. 2/87 by someone qualified.

## Summary

Since research/25, the field moved from "the vault fills, the model never sees it" to "**the owner
approves on their own device, per task**": 1Password for Agents (2026-10) now serves Muse, ChatGPT
Work, Perplexity and others, filling passwords and OTP codes, but only for partner agents and not
yet cards. Payments converged on **scoped single-use credentials**: Stripe Link's agent wallet gives
any authorised agent a one-time card per approved spend request (US and Canada consumers, approval in
the Link app within 30 min, 3DS returned as an action for the customer); Privacy.com gives US
individuals merchant-locked cards with an API; Stripe Issuing, ACP tokens, Visa and Mastercard agent
tokens, AP2 and PayPal's toolkit need a business or a partner platform; Apple Pay has no agent path.
OpenAI scaled back in-chat checkout in 2026-03, and a court enjoined Comet from Amazon because owner
consent is not site authorisation. Ducter has the sign-in design but not payments or travel details.
It should defer secrets to the owner's password manager, fill by reference, ask a Go card for every
payment on the phone, never store CVC, hand 3DS/OTP/passkeys to the owner live, and keep travel
details as consented private data with an audit of every use.
