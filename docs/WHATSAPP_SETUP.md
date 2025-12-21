# WhatsApp Business Cloud API Setup Guide

This guide walks you through setting up WhatsApp Business integration for QERO CRM.

## Prerequisites

- A Meta Business Account (business.facebook.com)
- A verified business
- A phone number for WhatsApp Business (can be a new number or existing)

## Phase 1: Meta Business Setup

### 1.1 Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Business** as the app type
4. Enter app name (e.g., "QERO WhatsApp Integration")
5. Select your Business Account

### 1.2 Add WhatsApp Product

1. In your app dashboard, click **Add Product**
2. Find **WhatsApp** and click **Set Up**
3. Follow the guided setup to create a WhatsApp Business Account (WABA)

### 1.3 Add Phone Number

1. Go to **WhatsApp** → **Getting Started** in your app
2. Click **Add phone number**
3. Choose between:
   - **Test phone number** (free, for development)
   - **Production phone number** (requires business verification)
4. Verify the phone number via SMS or voice call

### 1.4 Generate Permanent Access Token

1. Go to **Business Settings** → **Users** → **System Users**
2. Create a new System User with **Admin** role
3. Click **Generate new token**
4. Select your WhatsApp app
5. Add permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. **Save this token securely** - you'll need it for environment variables

### 1.5 Get IDs

From your app's WhatsApp section, note down:
- **Phone Number ID** (e.g., `123456789012345`)
- **WhatsApp Business Account ID** (WABA ID)
- **App Secret** (from App Settings → Basic)

## Phase 2: Environment Configuration

Add these environment variables to your Vercel project (or `.env.local` for local development):

```bash
# WhatsApp Cloud API
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=random_secure_string_you_create
WHATSAPP_APP_SECRET=your_app_secret

# Optional: for cron job security
CRON_SECRET=another_random_secure_string
```

## Phase 3: Webhook Configuration

### 3.1 Configure Webhook URL

1. Go to your app's **WhatsApp** → **Configuration**
2. Under **Webhook**, click **Edit**
3. Set:
   - **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   - **Verify token**: The same value you set for `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Click **Verify and save**

### 3.2 Subscribe to Webhook Events

1. After verification, click **Manage**
2. Subscribe to these webhook fields:
   - ✅ `messages` - Incoming messages
   - ✅ `message_status` - Delivery/read receipts

## Phase 4: Database Setup

Apply the WhatsApp migration to your Supabase database:

```bash
# Option 1: Using Supabase CLI (recommended)
supabase db push

# Option 2: Manual SQL
# Copy contents of supabase/migrations/037_whatsapp.sql and run in Supabase SQL Editor
```

### Create Storage Bucket

1. Go to your Supabase Dashboard → Storage
2. Create a new bucket named `whatsapp-media`
3. Set policies:
   - **SELECT**: Authenticated users
   - **INSERT**: Service role (webhooks use admin client)

## Phase 5: Create Message Templates

Templates are required for initiating conversations (outside 24h window).

### 5.1 Access Template Manager

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to **WhatsApp Manager** → **Message Templates**

### 5.2 Create Required Templates

#### Template: `followup_reminder_de`

- **Category**: UTILITY
- **Language**: German (de)
- **Header**: None
- **Body**:
  ```
  Hallo {{1}},
  
  Dies ist eine Erinnerung für Ihr geplantes Follow-up am {{2}}.
  
  Thema: {{3}}
  
  Bei Fragen stehen wir Ihnen gerne zur Verfügung.
  
  QERO Team
  ```
- **Footer**: Optional
- **Buttons**: Optional (e.g., "Anrufen" with phone number)

#### Template: `document_request_de`

- **Category**: UTILITY
- **Language**: German (de)
- **Header**: None
- **Body**:
  ```
  Hallo {{1}},
  
  Für Ihre Unterlagen benötigen wir noch: {{2}}
  
  Sie können das Dokument einfach als Antwort auf diese Nachricht senden.
  
  Vielen Dank!
  QERO Team
  ```

### 5.3 Wait for Approval

Templates need Meta approval (usually 24-48 hours). Status visible in Message Templates.

## Phase 6: Testing Checklist

### 6.1 Webhook Verification
- [ ] Deploy the application
- [ ] Verify webhook URL accepts Meta's challenge
- [ ] Check Vercel logs for `[WhatsApp Webhook] Verification successful`

### 6.2 Inbound Messages
- [ ] Send a WhatsApp message to your business number
- [ ] Check that message appears in database (`whatsapp_messages` table)
- [ ] Check that conversation is created (`whatsapp_conversations` table)
- [ ] Verify profile name is captured

### 6.3 Outbound Messages
- [ ] Open a TMA candidate with a phone number
- [ ] Send a text message via the WhatsApp panel
- [ ] Verify message appears in UI
- [ ] Verify delivery status updates (sent → delivered → read)

### 6.4 Media Messages
- [ ] Send an image via WhatsApp to your business number
- [ ] Verify image is downloaded and stored in `whatsapp-media` bucket
- [ ] Verify image appears in conversation thread

### 6.5 Templates
- [ ] Test follow-up reminder template
- [ ] Test document request template
- [ ] Verify templates work outside 24h window

### 6.6 Automations
- [ ] Set a follow-up for a TMA candidate
- [ ] Wait for cron job or manually trigger `/api/whatsapp/automation`
- [ ] Verify reminder message is sent

## Troubleshooting

### Webhook Not Receiving Events
1. Check webhook URL is correct and publicly accessible
2. Verify the verify token matches environment variable
3. Check Vercel logs for errors
4. Ensure webhook fields are subscribed

### Messages Not Sending
1. Verify access token is valid and not expired
2. Check phone number ID is correct
3. Verify recipient phone number format (no + prefix internally)
4. Check Meta's rate limits haven't been exceeded

### Template Errors
1. Ensure template is approved
2. Verify parameter count matches template placeholders
3. Check language code matches template language

### Media Download Fails
1. Access token may have expired
2. Media URL expires after some time - download immediately
3. Check storage bucket permissions

## Production Checklist

- [ ] Use production phone number (not test number)
- [ ] Complete business verification in Meta Business Manager
- [ ] Set up proper error monitoring (e.g., Sentry)
- [ ] Configure Vercel Cron for automated follow-ups
- [ ] Test with real users before rollout
- [ ] Document template texts for easy modification

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID from Meta | Yes |
| `WHATSAPP_ACCESS_TOKEN` | Permanent system user token | Yes |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Random string for webhook verification | Yes |
| `WHATSAPP_APP_SECRET` | App secret for signature verification | Recommended |
| `CRON_SECRET` | Secret for cron job authentication | Recommended |

## API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/whatsapp/webhook` | GET | Webhook verification |
| `/api/whatsapp/webhook` | POST | Incoming events |
| `/api/whatsapp/conversations` | GET | List conversations |
| `/api/whatsapp/conversations` | POST | Create conversation |
| `/api/whatsapp/messages` | GET | Get conversation messages |
| `/api/whatsapp/send` | POST | Send message to conversation |
| `/api/whatsapp/send-to` | POST | Send to phone number |
| `/api/whatsapp/automation` | POST | Trigger automation |
| `/api/cron/whatsapp-followups` | GET | Process due follow-ups |

## Support

For issues with:
- **Meta/WhatsApp API**: [Meta Business Help Center](https://www.facebook.com/business/help)
- **This integration**: Check the application logs and this documentation





