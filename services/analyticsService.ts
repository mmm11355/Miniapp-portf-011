
import { Session, OrderLog } from '../types';

const STORAGE_KEY = 'olga_analytics_sessions_v2';
const ORDERS_KEY = 'olga_analytics_orders_v2';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const BOT_TOKEN = '8319068202:AAERCkMtwnWXNGHLSN246DQShyaOHDK6z58';
const CHAT_ID = '-1002095569247';

const getTgUsername = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    // Попытка получить из основного объекта
    const user = tg?.initDataUnsafe?.user;
    if (user?.username) return `@${user.username}`;
    if (user?.id) return String(user.id);

    // Попытка распарсить сырые данные
    const rawData = tg?.initData;
    if (rawData) {
      const params = new URLSearchParams(rawData);
      const userStr = params.get('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        if (userData.username) return `@${userData.username}`;
        if (userData.id) return String(userData.id);
      }
    }

    // Попытка достать из URL (для десктопа/старых версий)
    const hash = window.location.hash;
    if (hash.includes('tgWebAppData')) {
      const webAppData = new URLSearchParams(hash.substring(1)).get('tgWebAppData');
      if (webAppData) {
        const decoded = decodeURIComponent(webAppData);
        const userMatch = decoded.match(/"username":"(.*?)"/);
        if (userMatch) return `@${userMatch[1]}`;
        const idMatch = decoded.match(/"id":(\d+)/);
        if (idMatch) return idMatch[1];
      }
    }
    
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
  } catch (e) {}
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      mode: 'no-cors', // Важно для Google Apps Script
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
    const tgId = getTgUsername();
    const newOrder: OrderLog = {
      ...order,
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      tgUsername: tgId,
      paymentStatus: 'pending'
    };

    const orders = analyticsService.getOrders();
    orders.push(newOrder);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));

    const botMsg = `<b>🚀 НОВЫЙ ЗАКАЗ!</b>\n\n` +
                   `👤 <b>Имя:</b> ${newOrder.customerName}\n` +
                   `📧 <b>Email:</b> ${newOrder.customerEmail}\n` +
                   `🛍 <b>Товар:</b> ${newOrder.productTitle}\n` +
                   `💰 <b>Сумма:</b> ${newOrder.price} ₽\n` +
                   `🔗 <b>Источник:</b> ${newOrder.utmSource}\n` +
                   `📱 <b>ТГ:</b> ${tgId}\n` +
                   `📢 <b>Рассылка:</b> ${newOrder.agreedToMarketing ? 'Да' : 'Нет'}`;
    
    await sendTgMessage(botMsg);

    // Отправляем мульти-ключи для совместимости с любыми скриптами
    await sendToScript({
      action: 'log',
      type: 'order',
      sessionId: currentSessionId || globalSessionId || 'unknown',
      orderId: newOrder.id,
      name: newOrder.customerName,
      email: newOrder.customerEmail,
      // Дублируем идентификатор пользователя во все возможные поля
      username: tgId,
      tgUsername: tgId,
      userId: tgId,
      user: tgId,
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
    const tgId = getTgUsername();
    
    if (idx !== -1) {
      orders[idx].paymentStatus = status;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
    
    if (status === 'paid') {
      await sendTgMessage(`✅ <b>ОПЛАТА ПОЛУЧЕНА!</b>\nЗаказ: <code>${orderId}</code>`);
    }

    await sendToScript({
      action: 'update_status',
      orderId: orderId,
      paymentStatus: status,
      // Опять дублируем ID
      username: tgId,
      tgUsername: tgId,
      userId: tgId,
      user: tgId,
      updatedBy: tgId,
      dateStr: formatNow()
    });
  },

  startSession: async (forcedUsername?: string): Promise<string> => {
    const sessionId = Math.random().toString(36).substr(2, 9);
    globalSessionId = sessionId;
    const params = new URLSearchParams(window.location.search);
    const timestamp = Date.now();
    const utmSource = params.get('utm_source') || 'direct';
    const tgId = forcedUsername || getTgUsername();

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
      tgUsername: tgId
    };

    const sessions = analyticsService.getSessions();
    sessions.push(newSession);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));

    await sendToScript({
      action: 'log',
      type: 'session_start',
      sessionId: sessionId,
      // Максимальный охват полей идентификации
      username: tgId,
      tgUsername: tgId,
      userId: tgId,
      user: tgId,
      name: tgId,
      city: city,
      country: country,
      utmSource: utmSource,
      dateStr: formatNow()
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    if (!sessionId) return;
    const tgId = getTgUsername();
    
    await sendToScript({
      action: 'log',
      type: 'path_update',
      sessionId: sessionId,
      // И здесь дублируем
      username: tgId,
      tgUsername: tgId,
      userId: tgId,
      user: tgId,
      path: path,
      product: `Переход: ${path}`,
      dateStr: formatNow()
    });
  }
};
