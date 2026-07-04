const { Telegraf } = require('telegraf');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { google } = require('googleapis'); 
require('dotenv').config();

// ==================== إعداداتك الأساسية ====================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MY_TELEGRAM_ID     = process.env.MY_TELEGRAM_ID;

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

    // تحديث الـ Token في كل مرة نرسل فيها إيميل لضمان عدم انتهاء الصلاحية
    oauth2Client.setCredentials({
        refresh_token: GMAIL_REFRESH_TOKEN
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // 1. قراءة ملف الـ PDF وتحويله إلى Base64
    let base64Cv = '';
    try {
        const fileBuffer = fs.readFileSync('./cv.pdf'); 
        base64Cv = fileBuffer.toString('base64');
    } catch (fileError) {
        throw new Error(`لم يتم العثور على ملف السيرة الذاتية cv.pdf. خطأ: ${fileError.message}`);
    }

   // 2. تجهيز قالب HTML نظيف ومطابق تماماً لرسائل Gmail الافتراضية
const htmlContent = `
<div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #222222; line-height: 1.5;">
  <p>السيد / مسؤول التوظيف المحترم،</p>
  <p>تحية طيبة وبعد،،</p>
  
  <p>أتمنى أن تكونوا بخير. أود أن أعبر عن اهتمامي الشديد بالتقدم لوظيفة <strong>(${data.jobTitle})</strong> المعلن عنها، وأرفق لكم سيرتي الذاتية للتقييم.</p>
  
  <p><strong>تفاصيل الطلب:</strong><br>
  <span style="white-space: pre-wrap;">${data.content}</span></p>
  
  <p><strong>مع خالص التقدير والاحترام،،</strong><br>
  ${data.myName}<br>
  ${data.myEmail}</p>
</div>
`;

    // 3. تحويل الـ HTML إلى Base64 لحمايته من التشوه عند الإرسال
    const base64Html = Buffer.from(htmlContent).toString('base64');

    // 4. تجهيز محتوى الرسالة وتنسيقها (MIME Builder) لدعم المرفقات والـ HTML
    const boundary = "tech_dev_boundary_" + new Date().getTime().toString(16);
    const utf8Subject = `=?utf-8?B?${Buffer.from(data.subject).toString('base64')}?=`;
    const cleanFileName = `CV_${data.myName.replace(/\s+/g, '_')}.pdf`;

    // بناء رسالة MIME القياسية
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

    const messageString = messageParts.join('\n');

    // تشفير الرسالة بصيغة base64url كما تتطلب واجهة Gmail API
    const encodedMessage = Buffer.from(messageString)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    // 5. إرسال الرسالة
    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedMessage
        }
    });

    return res.data;
}

// ==================== إعداد البوت ====================
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// قفل الحماية التلقائي
bot.use((ctx, next) => {
    const userId = ctx.from?.id.toString();
    if (userId !== MY_TELEGRAM_ID.toString()) {
        return ctx.reply("عذراً، هذا البوت خاص ومقفل لأسباب أمنية. 🔒");
    }
    return next();
});

bot.hears(['اهلا', 'أهلا', 'هلا', '/start'], (ctx) => {
    const templateMessage = `إليك قالب البيانات الجاهز. قم بنسخه وتعبئته ثم أرسله هنا:\n\n` +
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

// استقبال وتحليل الرسالة الموحدة
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();

    if (!text.includes('المرسل إليه ايميله:') || !text.includes('المحتوى:')) {
        return ctx.reply("⚠️ عذراً، النص المرسل لا يطابق القالب المعتمد. أرسل 'اهلا' للحصول على النموذج الموحد.");
    }

    const toEmailMatch   = text.match(/المرسل إليه ايميله:\s*(.+)/);
    const subjectMatch   = text.match(/العنوان:\s*(.+)/);
    const jobTitleMatch  = text.match(/المسمى الوظيفي:\s*(.+)/);
    const myNameMatch    = text.match(/اسم المتقدم:\s*(.+)/);
    const myEmailMatch   = text.match(/إيميل المتقدم:\s*(.+)/);
    
    const contentParts   = text.split(/المحتوى:\s*/);
    const content        = contentParts.length > 1 ? contentParts[1].trim() : '';

    if (!toEmailMatch || !subjectMatch || !jobTitleMatch || !myNameMatch || !myEmailMatch || !content) {
        return ctx.reply("⚠️ هناك حقول ناقصة في النموذج، يرجى ملء كافة البيانات وإعادة المحاولة.");
    }

    const data = {
        toEmail: toEmailMatch[1].trim(),
        subject: subjectMatch[1].trim(),
        jobTitle: jobTitleMatch[1].trim(),
        myName: myNameMatch[1].trim(),
        myEmail: myEmailMatch[1].trim(),
        content: content
    };

    await ctx.reply("جاري معالجة الملف وإرسال الإيميل مع المرفق عبر Gmail API... ⏳");

    try {
        await sendGmail(data);
        await ctx.reply(`✅ تم إرسال الإيميل بنجاح والمرفق جاهز تماماً! 🎉`);
    } catch (error) {
        console.error('Send Error:', error);
        await ctx.reply(`❌ فشل الإرسال. السبب:\n${error.message}`);
    }
});

bot.launch().then(() => {
    console.log("🚀 البوت الموحد شغال وجاهز لإرسال المرفقات عبر Gmail API!");
}).catch(err => console.error('⚠️ Bot launch error:', err));

// ==================== Web Server ====================
const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/health', (req, res) => res.status(200).send('ok'));
app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.get('/', (req, res) => res.send('Bot is active and using Gmail API!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));
