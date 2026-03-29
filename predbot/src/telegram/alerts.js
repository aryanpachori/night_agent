'use strict';

let _bot = null;
const chatId = () => process.env.TELEGRAM_CHAT_ID;

function setBot(bot) {
  _bot = bot;
}

async function send(text, extra = {}) {
  if (!_bot) throw new Error('Bot not initialised — call alerts.setBot(bot) first');
  try {
    return await _bot.sendMessage(chatId(), text, extra);
  } catch (err) {
    console.error(`[alerts] Failed to send message: ${err.message}`);
    return null;
  }
}

async function sendOpportunity(market, estimate, evResult, kellyFraction, betAmount, balance) {
  const { opportunityMessage } = require('./messages');
  const msg = opportunityMessage(market, estimate, evResult, kellyFraction, betAmount, balance);
  return send(msg.text, { parse_mode: msg.parse_mode, reply_markup: msg.reply_markup });
}

async function sendExitOpportunity(position, currentPrice, newEstimate) {
  const { exitOpportunityMessage } = require('./messages');
  const msg = exitOpportunityMessage(position, currentPrice, newEstimate);
  return send(msg.text, { parse_mode: msg.parse_mode, reply_markup: msg.reply_markup });
}

async function sendStopLoss(position, currentPrice, newEstimate) {
  const { stopLossMessage } = require('./messages');
  const msg = stopLossMessage(position, currentPrice, newEstimate);
  return send(msg.text, { parse_mode: msg.parse_mode, reply_markup: msg.reply_markup });
}

async function sendDailySummary(stats, closedToday) {
  const { dailySummaryMessage } = require('./messages');
  const msg = dailySummaryMessage(stats, closedToday);
  return send(msg.text, { parse_mode: msg.parse_mode });
}

async function sendText(text) {
  return send(text, { parse_mode: 'Markdown' });
}

module.exports = {
  setBot,
  sendOpportunity,
  sendExitOpportunity,
  sendStopLoss,
  sendDailySummary,
  sendText,
};
