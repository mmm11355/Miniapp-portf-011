
import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_cached_tg_user_v3';
const BROWSER_ID_KEY = 'olga_browser_fingerprint';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

// Генерация уникального ID устройства, если TG не отдал данные
const getBrowserFingerprint = () => {
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    id = 'DEV_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
};

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // ШАГ 1: Официальный объект
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // ШАГ 2: Глубокий парсинг URL (если SDK еще не проснулся)
    if (!userId) {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const rawData = tg?.initData || searchParams.get('tgWebAppData') || hashParams.get('tgWebAppData');
      
      if (rawData) {
        // Ищем ID в сырой строке через Regex
        const idMatch = rawData.match(/id%22%3A(\d+)/) || rawData.match(/"id":(\d+)/) || rawData.match(/id=(\d+)/);
        if (idMatch && idMatch[1]) userId = idMatch[1];
        
        const userMatch = rawData.match(/username%22%3A%22([^%"]+)/) || rawData.match(/"username":"([^"]+)/);
        if (userMatch && userMatch[1]) username = `@${userMatch[1]}`;
      }
    }

    // ШАГ 3: Кэш или Отпечаток
    const fingerprint = getBrowserFingerprint();
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

    // ВАЖНО: Если даже после всех попыток пусто — используем Fingerprint
    // Это исключает появление слова "Unknown" в таблице
    const finalId = userId || fingerprint;
    const finalUsername = username || finalId;
    const finalDisplayName = fullName || finalUsername;

    return {
      primaryId: finalUsername, // Пойдет в Email и Username
      tg_id: userId || 'none',
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'ERROR', tg_id: 'none', username: 'none', displayName: 'Ошибка SDK' };
  }
};

const getWebhookUrl = () => {
  try {
    const config = localStorage.getItem('olga_tg_config');
    if (config) {
      const parsed = JSON.parse(config);
      if (parsed.googleSheetWebhook) return parsed.googleSheetWebhook;
    }
  } catch (e) {}
  return DEFAULT_WEBHOOK;
};

const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  try {
    // Принудительно заменяем любые пустые значения на строковые маркеры
    const cleanPayload = JSON.parse(JSON.stringify(payload, (key, value) => {
      if (value === null || value === undefined || value === '') return 'ID_NOT_FOUND';
      return value;
    }));

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
      sessionId: currentSessionId || globalSessionId || 'order_sess',
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
    const sId = sessionId && sessionId !== 'session' ? sessionId : (globalSessionId || 'unknown_path');
    
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
