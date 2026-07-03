const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { google } = require('googleapis'); 

console.log("⏳ جاري بدء التشغيل وفحص المتغيرات...");

// ==================== فحص وحماية المتغيرات ====================
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("❌ خطأ فادح: توكن البوت (TELEGRAM_BOT_TOKEN) مفقود في إعدادات Render!");
    process.exit(1); // إغلاق السيرفر مع تسجيل الخطأ
}

// ==================== إعداداتك الأساسية ====================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MY_TELEGRAM_ID     = process.env.MY_TELEGRAM_ID;

const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_SENDER_EMAIL  = process.env.GMAIL_SENDER_EMAIL;

// إعداد مصادقة جوجل OAuth2
const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);

// ==================== وظيفة إرسال الإيميل عبر Gmail API ====================
async function sendGmail(data) {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        throw new Error('بيانات مصادقة Gmail غير مكتملة في إعدادات البيئة!');
    }

    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    let base64Cv = '';
    try {
        const fileBuffer = fs.readFileSync('./cv.pdf'); 
        base64Cv = fileBuffer.toString('base64');
    } catch (fileError) {
        throw new Error(`لم يتم العثور على ملف السيرة الذاتية cv.pdf. تأكد من رفعه إلى GitHub.`);
    }

    const htmlContent = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 10px; background-color: #f8fafc; border-radius: 12px;">
      <div style="background-color: #1e3a8a; padding: 15px 10px; border-radius: 10px 10px 0 0; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 17px; font-weight: 600;">${data.subject}</h2>
      </div>
      <div style="background-color: #ffffff; padding: 20px 15px; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0;">
        <p style="font-size: 14px; color: #334155;">السيد / مسؤول التوظيف المحترم،<br><br>أتمنى أن تكونوا بخير. أود التقدم لوظيفة <strong>(${data.jobTitle})</strong> وأرفق لكم سيرتي الذاتية للتقييم.</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #f1f5f9; border-right: 4px solid #1e3a8a;">
          <div style="color: #0f172a; font-size: 15px; font-weight: bold;">${data.myName}</div>
          <div style="color: #64748b; font-size: 12px;">${data.myEmail}</div>
        </div>
        <p style="font-size: 14px; color: #334155; background-color: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #f0f0f0; white-space: pre-wrap;">${data.content}</p>
      </div>
    </div>`;

    const base64Html = Buffer.from(htmlContent).toString('base64');
    const boundary = "tech_dev_boundary_" + new Date().getTime().toString(16);
    const utf8Subject = `=?utf-8?B?${Buffer.from(data.subject).toString('base64')}?=`;
    const cleanFileName = `CV_${data.myName.replace(/\s+/g, '_')}.pdf`;

    const messageParts = [
        `To: ${data.toEmail}`,
        `From: ${data.myName} <${GMAIL_SENDER_EMAIL}>`,
        `Subject: ${utf8Subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset="UTF-8"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        `${base64Html}`,
        ``,
        `--${boundary}`,
        `Content-Type: application/pdf; name="${cleanFileName}"`,
        `Content-Disposition: attachment; filename="${cleanFileName}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        `${base64Cv}`,
        `--${boundary}--`
    ];

    const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encodedMessage } });
    return res.data;
}

// ==================== إعداد البوت ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.use((ctx, next) => {
    const userId = ctx.from?.id.toString();
    if (userId !== MY_TELEGRAM_ID?.toString()) {
        return ctx.reply("عذراً، هذا البوت خاص ومقفل لأسباب أمنية. 🔒");
    }
    return next();
});

bot.hears(['اهلا', 'أهلا', 'هلا', '/start'], (ctx) => {
    ctx.replyWithHTML(`إليك قالب البيانات الجاهز:\n\n<pre>المرسل إليه ايميله: \nالعنوان: \nالمسمى الوظيفي: \nاسم المتقدم: \nإيميل المتقدم: \nالمحتوى:\n</pre>`);
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text.includes('المرسل إليه ايميله:') || !text.includes('المحتوى:')) {
        return ctx.reply("⚠️ عذراً، النص المرسل لا يطابق القالب المعتمد.");
    }

    try {
        const data = {
            toEmail: text.match(/المرسل إليه ايميله:\s*(.+)/)[1].trim(),
            subject: text.match(/العنوان:\s*(.+)/)[1].trim(),
            jobTitle: text.match(/المسمى الوظيفي:\s*(.+)/)[1].trim(),
            myName: text.match(/اسم المتقدم:\s*(.+)/)[1].trim(),
            myEmail: text.match(/إيميل المتقدم:\s*(.+)/)[1].trim(),
            content: (text.split(/المحتوى:\s*/)[1] || '').trim()
        };

        await ctx.reply("جاري معالجة الملف وإرسال الإيميل مع المرفق... ⏳");
        await sendGmail(data);
        await ctx.reply(`✅ تم الإرسال بنجاح!`);
    } catch (error) {
        console.error('Send Error:', error);
        await ctx.reply(`❌ فشل الإرسال. السبب:\n${error.message}`);
    }
});

// ==================== Web Server ====================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('Bot is active!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web server listening on port ${PORT}`);
});

bot.launch().then(() => {
    console.log("🚀 البوت الموحد شغال وجاهز!");
}).catch(err => {
    console.error('⚠️ Bot launch error:', err.message);
});

// ==================== الإغلاق الآمن ====================
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// صائد الأخطاء غير المتوقعة حتى لا ينهار السيرفر بصمت
process.on('uncaughtException', (err) => {
    console.error('❌ خطأ غير متوقع أدى لانهيار السيرفر:', err);
});
