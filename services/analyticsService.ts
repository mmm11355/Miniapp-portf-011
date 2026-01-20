
import { Session, OrderLog } from '../types';

const STORAGE_KEY = 'olga_analytics_sessions_v2';
const CACHED_USER_KEY = 'olga_cached_tg_user_v1';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let user = tg?.initDataUnsafe?.user;

    // Метод "Супермозг" №1: Если объект пуст, парсим сырую строку initData
    if (!user && tg?.initData) {
      try {
        const params = new URLSearchParams(tg.initData);
        const userStr = params.get('user');
        if (userStr) user = JSON.parse(userStr);
      } catch (e) {}
    }

    // Извлекаем данные
    const id = user?.id ? String(user.id) : null;
    const username = user?.username ? `@${user.username}` : null;
    const firstName = user?.first_name || '';
    const lastName = user?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    // Метод "Супермозг" №2: Кэширование. Если нашли ID — запоминаем. Если не нашли — берем из кэша.
    if (id) {
      const cacheData = { id, username, fullName };
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(cacheData));
    }

    const cached = localStorage.getItem(CACHED_USER_KEY);
    const cachedUser = cached ? JSON.parse(cached) : null;

    const finalId = id || cachedUser?.id || null;
    const finalUsername = username || cachedUser?.username || finalId || 'guest';
    const finalDisplayName = fullName || cachedUser?.fullName || finalUsername || 'Пользователь';

    // ВАЖНО: Если ника нет, во все идентификаторы пишем ID (например, 1843449768)
    // Это уберет "Unknown" из вашей таблицы навсегда.
    return {
      primaryId: finalUsername === 'guest' ? 'guest' : finalUsername,
      tg_id: finalId || 'none',
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'guest', tg_id: 'none', username: 'none', displayName: 'Гость' };
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

    await sendToScript({
      action: 'log',
      type: 'order',
      sessionId: currentSessionId || globalSessionId || 'unknown',
      orderId: newOrder.id,
      name: `${newOrder.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId,
      username: userInfo.username,
      tg_id: userInfo.tg_id,
      product: newOrder.productTitle,
      price: newOrder.price,
      utmSource: newOrder.utmSource,
      dateStr: formatNow()
    });
    
    return newOrder;
  },

  updateOrderStatus: async (orderId: string, status: 'paid' | 'failed') => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      action: 'update_status',
      type: 'order',
      orderId: orderId,
      status: status,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      dateStr: formatNow()
    });
  },

  startSession: async (forcedUsername?: string): Promise<string> => {
    const userInfo = getDetailedTgUser();
    const tgId = forcedUsername || userInfo.primaryId;
    const safeId = tgId.replace(/[^a-zA-Z0-9]/g, '') || 'user';
    const sessionId = `${safeId}_${Math.random().toString(36).substr(2, 4)}`;
    globalSessionId = sessionId;
    
    const params = new URLSearchParams(window.location.search);
    
    await sendToScript({
      action: 'log',
      type: 'session_start',
      sessionId: sessionId,
      name: userInfo.displayName,
      email: tgId,
      tgUsername: tgId,
      tg_id: userInfo.tg_id,
      username: userInfo.username,
      utmSource: params.get('utm_source') || 'direct',
      dateStr: formatNow()
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    const userInfo = getDetailedTgUser();
    const sId = sessionId && sessionId !== 'session' ? sessionId : (globalSessionId || 'unknown');
    
    await sendToScript({
      action: 'log',
      type: 'path_update',
      sessionId: sId,
      name: userInfo.displayName,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      tg_id: userInfo.tg_id,
      path: path,
      dateStr: formatNow()
    });
  }
};
