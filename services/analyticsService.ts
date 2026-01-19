
import { Session, OrderLog } from '../types';

const STORAGE_KEY = 'olga_analytics_sessions_v2';
const ORDERS_KEY = 'olga_analytics_orders_v2';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }
    const user = tg?.initDataUnsafe?.user;
    const id = user?.id ? String(user.id) : null;
    const username = user?.username ? `@${user.username}` : null;
    const firstName = user?.first_name || '';
    const lastName = user?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      primaryId: username || id || 'guest',
      id: id,
      username: username,
      displayName: username || fullName || id || 'Гость'
    };
  } catch (e) {
    return { primaryId: 'guest', id: null, username: null, displayName: 'Гость' };
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

const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

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
    const userInfo = getDetailedTgUser();
    const newOrder: OrderLog = {
      ...order,
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      tgUsername: userInfo.primaryId,
      paymentStatus: 'pending'
    };

    const orders = analyticsService.getOrders();
    orders.push(newOrder);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));

    await sendToScript({
      action: 'log',
      type: 'order',
      sessionId: currentSessionId || globalSessionId || 'unknown',
      orderId: newOrder.id,
      name: `${newOrder.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      userId: userInfo.id || 'none',
      product: newOrder.productTitle,
      price: newOrder.price,
      utmSource: newOrder.utmSource,
      paymentStatus: 'pending',
      dateStr: formatNow(),
      timestamp: timestamp
    });
    
    return newOrder;
  },

  updateOrderStatus: async (orderId: string, status: 'paid' | 'failed') => {
    const orders = analyticsService.getOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    const userInfo = getDetailedTgUser();
    if (idx !== -1) {
      orders[idx].paymentStatus = status;
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
    await sendToScript({
      action: 'update_status',
      orderId: orderId,
      paymentStatus: status,
      tgUsername: userInfo.primaryId,
      userId: userInfo.id || 'none',
      dateStr: formatNow()
    });
  },

  startSession: async (forcedUsername?: string): Promise<string> => {
    const sessionId = Math.random().toString(36).substr(2, 9);
    globalSessionId = sessionId;
    const params = new URLSearchParams(window.location.search);
    const userInfo = getDetailedTgUser();
    const tgId = forcedUsername || userInfo.primaryId;
    
    const newSession: Session = {
      id: sessionId,
      startTime: Date.now(),
      city: 'Unknown',
      country: 'Unknown',
      pathHistory: ['home'],
      duration: 0,
      utmSource: params.get('utm_source') || 'direct',
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
      tgUsername: tgId,
      userId: userInfo.id || 'none',
      name: userInfo.displayName, // Записываем в колонку Имя
      email: tgId, // Записываем в колонку Email для видимости
      utmSource: newSession.utmSource,
      dateStr: formatNow()
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    if (!sessionId) return;
    const userInfo = getDetailedTgUser();
    await sendToScript({
      action: 'log',
      type: 'path_update',
      sessionId: sessionId,
      tgUsername: userInfo.primaryId,
      userId: userInfo.id || 'none',
      name: `Переход: ${path}`, // Отображаем активность в Имени
      email: userInfo.primaryId,
      dateStr: formatNow()
    });
  }
};
