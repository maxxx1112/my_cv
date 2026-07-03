const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { google } = require('googleapis'); 
require('dotenv').config();

// ==================== إعداداتك الأساسية ====================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MY_TELEGRAM_ID     = process.env.MY_TELEGRAM_ID;
const API_SECRET         = process.env.API_SECRET || "my_super_secret_key_123"; // مفتاح الحماية بين السيرفرين

// ==================== متغيرات Gmail API ====================
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
        throw new Error(`لم يتم العثور على ملف السيرة الذاتية cv.pdf. خطأ: ${fileError.message}`);
    }

    const htmlContent = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 10px; background-color: #f8fafc; border-radius: 12px;">
      <div style="background-color: #1e3a8a; padding: 15px 10px; border-radius: 10px 10px 0 0; text-align: center;">
        <h2 style="color: #ffffff; margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 0.5px;">${data.subject}</h2>
      </div>
      <div style="background-color: #ffffff; padding: 20px 15px; border-radius: 0 0 10px 10px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <p style="font-size: 14px; color: #334155; line-height: 1.5; margin-top: 0;">
          السيد / مسؤول التوظيف المحترم،<br><br>
          تحية طيبة وبعد،،<br><br>
          أتمنى أن تكونوا بخير. أود أن أعبر عن اهتمامي الشديد بالتقدم لوظيفة <strong>(${data.jobTitle})</strong> المعلن عنها، وأرفق لكم سيرتي الذاتية للتقييم.</p>
        <div style="margin: 20px 0; padding: 15px; background-color: #f1f5f9; border-right: 4px solid #1e3a8a; border-radius: 6px;">
          <table style="width: 100%;" role="presentation" border="0" cellspacing="0" cellpadding="0">
            <tbody>
              <tr>
                <td style="vertical-align: middle;">
                  <div style="color: #0f172a; font-size: 15px; font-weight: bold; margin-bottom: 2px;">${data.myName}</div>
                  <div style="color: #64748b; font-size: 12px;">${data.myEmail}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top: 15px;">
          <h3 style="color: #1e3a8a; font-size: 13px; margin-bottom: 8px; border-bottom: 2px solid #f1f5f9; padding-bottom: 4px;">تفاصيل الطلب:</h3>
          <p style="font-size: 14px; color: #334155; line-height: 1.6; background-color: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #f0f0f0; margin: 0; white-space: pre-wrap;">${data.content}</p>
        </div>
        <div style="margin-top: 25px; padding: 15px; border-radius: 8px; background-color: #f8fafc; text-align: center; border: 1px dashed #cbd5e1;">
          <p style="font-size: 14px; color: #1e3a8a; font-weight: bold; margin: 0;"> تم إرفاق ملف السيرة الذاتية (PDF) مع هذه الرسالة للاطلاع.</p>
        </div>
        <div style="margin-top: 25px; text-align: center;">
          <p style="font-size: 13px; color: #64748b; margin: 0;">أشكركم على وقتكم واهتمامكم، وأتطلع لفرصة التواصل معكم قريباً.</p>
          <p style="font-size: 14px; color: #0f172a; font-weight: bold; margin-top: 6px;">مع خالص التقدير والاحترام،،</p>
        </div>
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

    const encodedMessage = Buffer.from(messageParts.join('\n'))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedMessage }
    });

    return res.data;
}

// ==================== إعداد البوت (للإرسال اليدوي كنسخة احتياطية) ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

bot.use((ctx, next) => {
    const userId = ctx.from?.id.toString();
    if (userId !== MY_TELEGRAM_ID.toString()) {
        return ctx.reply("عذراً، هذا البوت خاص ومقفل لأسباب أمنية. 🔒");
    }
    return next();
});

bot.hears(['اهلا', 'أهلا', 'هلا', '/start'], (ctx) => {
    const templateMessage = `إليك قالب البيانات الجاهز:\n\n` +
    `<pre>` +
    `المرسل إليه ايميله: \n` +
    `العنوان: \n` +
    `المسمى الوظيفي: \n` +
    `اسم المتقدم: \n` +
    `إيميل المتقدم: \n` +
    `المحتوى:\n` +
    `</pre>`;
    ctx.replyWithHTML(templateMessage);
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();

    if (!text.includes('المرسل إليه ايميله:') || !text.includes('المحتوى:')) {
        return ctx.reply("⚠️ عذراً، النص المرسل لا يطابق القالب المعتمد.");
    }

    const toEmailMatch   = text.match(/المرسل إليه ايميله:\s*(.+)/);
    const subjectMatch   = text.match(/العنوان:\s*(.+)/);
    const jobTitleMatch  = text.match(/المسمى الوظيفي:\s*(.+)/);
    const myNameMatch    = text.match(/اسم المتقدم:\s*(.+)/);
    const myEmailMatch   = text.match(/إيميل المتقدم:\s*(.+)/);
    const contentParts   = text.split(/المحتوى:\s*/);
    const content        = contentParts.length > 1 ? contentParts[1].trim() : '';

    if (!toEmailMatch || !subjectMatch || !jobTitleMatch || !myNameMatch || !myEmailMatch || !content) {
        return ctx.reply("⚠️ هناك حقول ناقصة في النموذج.");
    }

    const data = {
        toEmail: toEmailMatch[1].trim(),
        subject: subjectMatch[1].trim(),
        jobTitle: jobTitleMatch[1].trim(),
        myName: myNameMatch[1].trim(),
        myEmail: myEmailMatch[1].trim(),
        content: content
    };

    await ctx.reply("جاري الإرسال عبر Gmail API... ⏳");

    try {
        await sendGmail(data);
        await ctx.reply(`✅ تم إرسال الإيميل بنجاح! 🎉`);
    } catch (error) {
        console.error('Send Error:', error);
        await ctx.reply(`❌ فشل الإرسال. السبب:\n${error.message}`);
    }
});

bot.launch().catch(err => console.error('⚠️ Bot launch error:', err));

// ==================== Web Server & API Endpoint ====================
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => res.send('Bot is active and using Gmail API!'));

// نقطة الاستقبال الجديدة (API Endpoint)
app.post('/api/send-email', async (req, res) => {
    const authHeader = req.headers.authorization;
    
    // التحقق من مفتاح الأمان
    if (authHeader !== `Bearer ${API_SECRET}`) {
        return res.status(401).json({ success: false, error: "Unauthorized: Invalid API Secret" });
    }

    try {
        const data = req.body;
        // التحقق من وجود البيانات الأساسية
        if (!data.toEmail || !data.subject || !data.content) {
            return res.status(400).json({ success: false, error: "Missing required fields" });
        }

        await sendGmail(data);
        console.log(`✅ تم إرسال الإيميل برمجياً عبر الـ API إلى: ${data.toEmail}`);
        res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
        console.error('API Send Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Web server listening on port ${PORT} with API enabled`));
