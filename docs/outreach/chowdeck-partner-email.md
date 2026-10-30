# Email to Chowdeck: partner API access

Instructions for an AI assistant (e.g. Claude with Claude in Chrome) asked to send this:

1. Find Chowdeck's partnerships or support contact on https://chowdeck.com/contact and https://help.chowdeck.com. Use a contact form or address from those pages. Do not guess an address.
2. Ask the user for the placeholders in `[brackets]` (name, city, phone/email). Do not invent them.
3. Show the user the final subject, recipient and body, and **wait for an explicit "send"**. Do not send without it.
4. Send once. Do not resend or follow up unless the user asks.

---

**Subject:** Partner API access for personal AI agents placing Chowdeck orders

Hello Chowdeck team,

I'm [your name], a developer in [city]. I'm building a small open-source command-line tool that lets a customer's own AI assistant order food on their behalf, for example "order my usual jollof from the place near me." I'd like to build it on an official Chowdeck integration rather than automating the website, which I know is fragile and may not be welcome.

**What I'm asking for**
- Access to an API (or partner programme) that allows a customer-authorised app to search vendors and menus, get a price quote with fees and ETA, place an order, and track its status.
- Customer login via OTP or OAuth, so the tool never sees passwords or card details.
- Sandbox or test credentials, if available.

**Safeguards built into the tool**
- Every order is a dry run until the customer explicitly confirms the exact items, total and address.
- A per-order spend cap that the customer sets.
- Payment only through the customer's own Chowdeck balance or saved method.
- A local log of every order placed.

I noticed that Chowdeck already works with Paystack's Index agent and has WhatsApp ordering, so I hope a developer route for customer-authorised agents is something you're open to. If an API isn't available, I'd also appreciate knowing whether a partner programme exists, or who the right person is to talk to.

The code is here: https://github.com/billmal071/chowdeck-cli

I'm happy to give a demo or jump on a short call.

Thank you,
[Your name]
[Phone / email]
