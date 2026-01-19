
import { Session, OrderLog } from '../types';

const STORAGE_KEY = 'olga_analytics_sessions_v2';
const ORDERS_KEY = 'olga_analytics_orders_v2';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

// ВАШИ ДАННЫЕ ДЛЯ АВТОМАТИЗАЦИИ
const BOT_TOKEN = '8319068202:AAERCkMtwnWXNGHLSN246DQShyaOHDK6z58';
const CHAT_ID = '-1002095569247';

const getTgUsername = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (user?.username) return `@${user.username}`;
    if (user?.first_name) {
      const full = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
      return full;
    }
    if (user?.id) return `ID: ${user.id}`;
    return 'Гость';
  } catch (e) {
    return 'Гость';
  }
};

const getWebhookUrl = () => {
  try {
    const config = localStorage.getItem('olga_tg_config');
    if (config) {
      const parsed = JSON.parse(config);
      if (parsed.googleSheetWebhook && parsed.googleSheetWebhook.trim() !== '') {
        return parsed.googleSheetWebhook;
      }
    }
  } catch (e) {}
  return DEFAULT_WEBHOOK;
};

// ГАРАНТИРОВАННАЯ ОТПРАВКА В БОТ
const sendTgMessage = async (text: string) => {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch (e) {
    console.error("Critical Bot Error:", e);
  }
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
};

export const analyticsService = {
  getSessions: (): Session[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },

  getOrders: (): OrderLog[] => {
    try {
      const data = localStorage.getItem(ORDERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
  },

  logOrder: async (order: Omit<OrderLog, 'id' | 'timestamp' | 'paymentStatus'>, currentSessionId?: string) => {
    const timestamp = Date.now();
    const tgUsername = getTgUsername();
    const newOrder: OrderLog = {
      ...order,
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      tgUsername,
      paymentStatus: 'pending'
    };

    const orders = analyticsService.getOrders();
    orders.push(newOrder);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));

    // 1. СНАЧАЛА ЖДЕМ ОТПРАВКИ В БОТ
    const botMsg = `<b>🚀 НОВЫЙ ЗАКАЗ!</b>\n\n` +
                   `👤 <b>Имя:</b> ${newOrder.customerName}\n` +
                   `📧 <b>Email:</b> ${newOrder.customerEmail}\n` +
                   `🛍 <b>Товар:</b> ${newOrder.productTitle}\n` +
                   `💰 <b>Сумма:</b> ${newOrder.price} ₽\n` +
                   `🔗 <b>Источник:</b> ${newOrder.utmSource}\n` +
                   `📱 <b>ТГ:</b> ${tgUsername}\n` +
                   `📢 <b>Рассылка:</b> ${newOrder.agreedToMarketing ? 'Да' : 'Нет'}`;
    
    await sendTgMessage(botMsg);

    // 2. ЗАТЕМ В ТАБЛИЦУ
    await sendToScript({
      action: 'log',
      type: 'order',
      sessionId: currentSessionId || globalSessionId || 'unknown',
      orderId: newOrder.id,
      name: newOrder.customerName,
      email: newOrder.customerEmail,
      phone: 'none',
      tgUsername: tgUsername,
      product: newOrder.productTitle,
      price: newOrder.price,
      utmSource: newOrder.utmSource,
      paymentStatus: 'pending',
      agreedToMarketing: newOrder.agreedToMarketing ? 'Да' : 'Нет',
      dateStr: formatNow(),
      timestamp: timestamp
    });
    
    return newOrder;
  },

  updateOrderStatus: async (orderId: string, status: 'paid' | 'failed') => {
    const orders = analyticsService.getOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      orders[idx].paymentStatus = status;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
    
    // БОТ ТЕПЕРЬ СООБЩАЕТ ОБ ОБОИХ ВАЖНЫХ СТАТУСАХ
    if (status === 'paid') {
      await sendTgMessage(`✅ <b>ОПЛАТА ПОЛУЧЕНА!</b>\nЗаказ: <code>${orderId}</code>`);
    } else if (status === 'failed') {
      await sendTgMessage(`❌ <b>ЗАКАЗ ОТМЕНЕН!</b>\nЗаказ: <code>${orderId}</code>`);
    }

    await sendToScript({
      action: 'update_status',
      orderId: orderId,
      paymentStatus: status,
      updatedBy: getTgUsername(),
      dateStr: formatNow()
    });
  },

  startSession: async (): Promise<string> => {
    const sessionId = Math.random().toString(36).substr(2, 9);
    globalSessionId = sessionId;
    const params = new URLSearchParams(window.location.search);
    const timestamp = Date.now();
    const utmSource = params.get('utm_source') || 'direct';
    const tgUsername = getTgUsername();

    let city = 'Unknown';
    let country = 'Unknown';
    try {
      const geoRes = await fetch('https://ipapi.co/json/');
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        city = geoData.city || 'Unknown';
        country = geoData.country_name || 'Unknown';
      }
    } catch (e) {}
    
    const newSession: Session = {
      id: sessionId,
      startTime: timestamp,
      city: city,
      country: country,
      pathHistory: ['home'],
      duration: 0,
      utmSource: utmSource,
      utmMedium: params.get('utm_medium') || 'none',
      utmCampaign: params.get('utm_campaign') || 'none',
      tgUsername: tgUsername
    };

    const sessions = analyticsService.getSessions();
    sessions.push(newSession);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

    sendToScript({
      action: 'log',
      type: 'session_start',
      sessionId: sessionId,
      tgUsername: tgUsername,
      name: tgUsername,
      city: city,
      country: country,
      utmSource: utmSource,
      dateStr: formatNow()
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    if (!sessionId) return;
    const sessions = analyticsService.getSessions();
    const index = sessions.findIndex(s => s.id === sessionId);
    const tgUsername = getTgUsername();
    
    if (index !== -1) {
      if (!sessions[index].pathHistory.includes(path)) {
        sessions[index].pathHistory.push(path);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      }
    }
    
    sendToScript({
      action: 'log',
      type: 'path_update',
      sessionId: sessionId,
      tgUsername: tgUsername,
      path: path,
      product: `Переход: ${path}`,
      dateStr: formatNow()
    });
  }
};
