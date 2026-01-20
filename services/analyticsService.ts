
import { Session, OrderLog } from '../types';

const STORAGE_KEY = 'olga_analytics_sessions_v2';
const CACHED_USER_KEY = 'olga_cached_tg_user_v2';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

// Мировой супермозг: Извлекаем ID даже из "камня"
export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Пытаемся взять из официального объекта
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Если пусто, применяем REGEX к сырой строке (initData)
    // Это достанет ID 1843449768 даже если объект user еще не распарсился
    if (!userId && tg?.initData) {
      const idMatch = tg.initData.match(/id(?:%22|")%3A(\d+)/) || tg.initData.match(/id":(\d+)/);
      if (idMatch && idMatch[1]) userId = idMatch[1];
      
      const userMatch = tg.initData.match(/username(?:%22|")%3A(?:%22|")([^%"]+)/);
      if (userMatch && userMatch[1]) username = `@${userMatch[1]}`;
    }

    // 3. Крайняя мера: парсим URL Hash напрямую
    if (!userId) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const initDataRaw = hashParams.get('tgWebAppData');
      if (initDataRaw) {
        const idMatch = initDataRaw.match(/id%22%3A(\d+)/);
        if (idMatch && idMatch[1]) userId = idMatch[1];
      }
    }

    // Кэширование для стабильности
    if (userId) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        userId = c.userId;
        username = c.username;
        fullName = c.fullName;
      }
    }

    const finalId = userId || 'none';
    const finalUsername = username || userId || 'guest';
    const finalDisplayName = fullName || username || userId || 'Пользователь';

    return {
      primaryId: finalUsername, // Это пойдет в Email/Username колонки
      tg_id: finalId,
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

// Предохранитель: заменяет все null/undefined на строковые значения перед отправкой
const sanitizePayload = (payload: any) => {
  const sanitized: any = {};
  for (const key in payload) {
    const val = payload[key];
    if (val === null || val === undefined || val === '') {
      sanitized[key] = (key === 'username' || key === 'email') ? 'ID_Pending' : 'No_Data';
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
};

const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  try {
    const cleanPayload = sanitizePayload(payload);
    await fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cleanPayload)
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
      sessionId: currentSessionId || globalSessionId || 'session_order',
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
    
    // Генерируем ID сессии на базе ID пользователя для связки
    const safeId = String(tgId).replace(/[^a-zA-Z0-9]/g, '') || 'user';
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
    const sId = sessionId && sessionId !== 'session' ? sessionId : (globalSessionId || 'unknown_session');
    
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
