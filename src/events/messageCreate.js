const { Events, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const paymentHandler = require('../handlers/paymentHandler');
const paymentEmbeds = require('../utils/paymentEmbeds');
const { dbQueries } = require('../database/db');

const securityHandler = require('../handlers/securityHandler');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot) return;

    const isPaymentBot = Boolean(
      process.env.PAYMENT_CLIENT_ID && client.user && (
        client.user.id === process.env.PAYMENT_CLIENT_ID ||
        client.user.id === '1551987536925032569'
      )
    );

    // Check if message is in a server channel (Guild)
    const isDM = !message.guild || message.channel.type === ChannelType.DM;
    if (!isDM) {
      // Main Bot runs automated scam, spam, phishing, and flood security check
      if (!isPaymentBot) {
        await securityHandler.handleMessage(message);
      }
      return;
    }

    // If dedicated Payment Bot is running, let Payment Bot handle DM payments exclusively
    if (process.env.PAYMENT_BOT_TOKEN && !isPaymentBot) {
      return;
    }


    const targetGuild = client.guilds.cache.first();
    if (!targetGuild) return;

    // Check for image attachments (JPG, PNG, JPEG, WEBP)
    const imageAttachment = message.attachments.find(
      att => (att.contentType && att.contentType.startsWith('image/')) ||
             /\.(jpg|jpeg|png|webp)$/i.test(att.name || '')
    );

    const text = message.content ? message.content.trim() : '';
    // Look for 10-22 digit UTR number in message text
    const utrMatch = text.match(/\b(\d{10,22})\b/);
    const foundUtr = utrMatch ? utrMatch[1] : null;

    // Look for an amount
    const amountMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d{2,6})\b/i);
    const foundAmount = amountMatch ? amountMatch[1] : '250';

    // 1. If user sent an image attachment (Screenshot)
    if (imageAttachment) {
      const userPayments = dbQueries.getUserPayments(message.author.id);
      const pendingPayment = userPayments.filter(p => p.status === 'PENDING').pop();

      if (pendingPayment) {
        // User already has a pending payment -> Attach screenshot!
        dbQueries.updatePaymentRecord(pendingPayment.id, {
          screenshot_url: imageAttachment.url,
          ...(foundUtr && pendingPayment.utr === 'N/A' ? { utr: foundUtr } : {})
        });

        // Forward screenshot alert to #🛡️-payment-verification
        const adminChan = await paymentHandler.ensureAdminPaymentChannel(targetGuild);
        if (adminChan) {
          const updatedPayment = dbQueries.getPayment(pendingPayment.id);
          const alertPayload = paymentEmbeds.createAdminPaymentAlertEmbed(updatedPayment);
          await adminChan.send({
            content: `📸 **Payment Screenshot Attached by User!** Payment ID: \`#${pendingPayment.id}\` (<@${message.author.id}>) | Amount: \`₹${pendingPayment.amount}\` (UTR: \`${pendingPayment.utr}\`)`,
            ...alertPayload
          }).catch(() => null);
        }

        return message.reply({
          content: `✅ **Payment Screenshot Attached Successfully!**\n\n` +
            `• **Payment ID:** \`#${pendingPayment.id}\`\n` +
            `• **Amount:** \`₹${pendingPayment.amount}\`\n` +
            `• **UTR Reference:** \`${pendingPayment.utr}\`\n` +
            `• **Screenshot:** 📸 Attached (${imageAttachment.name})\n` +
            `• **Status:** \`PENDING ADMIN VERIFICATION\`\n\n` +
            `*Admins in \`#🛡️-payment-verification\` have been alerted and will verify your transaction shortly!*`
        });
      }

      // No pending payment exists yet:
      if (foundUtr) {
        // User sent image + UTR in text!
        const res = await paymentHandler.submitPaymentProof(
          client,
          targetGuild,
          { id: message.author.id, user: message.author, guild: targetGuild },
          {
            amount: foundAmount,
            utr: foundUtr,
            purpose: 'Direct Payment Submission',
            screenshotUrl: imageAttachment.url
          }
        );
        return message.reply({ content: res.message });
      }

      // User sent image without UTR: Create pending payment with screenshot and prompt for UTR
      const res = await paymentHandler.submitPaymentProof(
        client,
        targetGuild,
        { id: message.author.id, user: message.author, guild: targetGuild },
        {
          amount: foundAmount,
          utr: 'N/A',
          purpose: 'Payment Proof (Pending UTR)',
          screenshotUrl: imageAttachment.url
        }
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_pay_submit_for_${foundAmount}`)
          .setLabel(`Submit UTR Reference Number`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('🧾')
      );

      return message.reply({
        content: `📸 **Payment Screenshot Received!**\n` +
          `We saved your screenshot under Payment ID **#${res.payment.id}**.\n\n` +
          `👉 **Please reply with your 12-digit UTR reference number** (or click the button below) to complete verification!`,
        components: [row]
      });
    }

    // 2. If user sent text with a UTR number (without image)
    if (foundUtr) {
      const userPayments = dbQueries.getUserPayments(message.author.id);
      const pendingPayment = userPayments.filter(p => p.status === 'PENDING').pop();

      if (pendingPayment) {
        dbQueries.updatePaymentRecord(pendingPayment.id, { utr: foundUtr });
        return message.reply({
          content: `✅ **UTR Number Updated!**\nPayment ID **#${pendingPayment.id}** UTR set to: \`${foundUtr}\`.\n\n` +
            (!pendingPayment.screenshot_url ? `📸 *Now please upload your payment screenshot photo here in DM to complete verification!*` : `*Staff is reviewing your submission.*`)
        });
      }

      // Create new payment submission
      const res = await paymentHandler.submitPaymentProof(
        client,
        targetGuild,
        { id: message.author.id, user: message.author, guild: targetGuild },
        {
          amount: foundAmount,
          utr: foundUtr,
          purpose: 'Direct Payment Submission',
          screenshotUrl: null
        }
      );

      return message.reply({
        content: `${res.message}\n\n📸 **Next Step:** Please reply to this DM by uploading your **payment screenshot (JPG/PNG)**!`
      });
    }
  }
};
