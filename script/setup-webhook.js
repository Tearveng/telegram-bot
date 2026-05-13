// scripts/setup-webhook.js

const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VERCEL_URL = process.env.VERCEL_URL;

if (!BOT_TOKEN || !VERCEL_URL) {
  console.error('❌ TELEGRAM_BOT_TOKEN and VERCEL_URL are required!');
  console.error('Usage: VERCEL_URL=your-app.vercel.app node setup-webhook.js');
  process.exit(1);
}

const webhookUrl = `https://${VERCEL_URL}/api/webhook`;

console.log(`Setting webhook to: ${webhookUrl}`);

const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${webhookUrl}&drop_pending_updates=true`;

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const response = JSON.parse(data);
    
    if (response.ok) {
      console.log('✅ Webhook set successfully!');
      console.log(`   URL: ${webhookUrl}`);
      console.log(`   Pending updates dropped: true`);
    } else {
      console.error('❌ Failed to set webhook:', response.description);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ Error setting webhook:', err.message);
  process.exit(1);
});