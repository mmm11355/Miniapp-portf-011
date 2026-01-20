
/**
 * СУПЕРМОЗГ: ИСПРАВЛЕННЫЙ GOOGLE SCRIPT (Для doPost в таблице)
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_cached_tg_user_v7';
// ВАШ ТЕКУЩИЙ WEBHOOK
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbz10cekQSLd-wYMGnxGPJ-gnIGD6eKs-DQUEmFsX-EOQ3vtBNoHXmOI9h0xsLSIzdg/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Пытаемся взять из SDK (самый надежный способ)
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. ГЛУБОКИЙ ПАРСИНГ: Если SDK еще не проснулся или мы на десктопе
    if (!userId || !username) {
      const source = decodeURIComponent(tg?.initData || window.location.hash || window.location.search);
      
      if (!userId) {
        const idMatch = source.match(/"id":(\d+)/) || source.match(/id=(\d+)/);
        if (idMatch) userId = idMatch[1];
      }
      
      if (!username) {
        const userMatch = source.match(/"username":"([^"]+)"/) || source.match(/username=([^&]+)/);
        if (userMatch && userMatch[1]) {
          username = `@${userMatch[1].replace(/^@/, '')}`;
        }
      }
    }

    // 3. Кэширование для стабильности
    if (userId) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        userId = userId || c.userId;
        username = username || c.username;
        fullName = fullName || c.fullName;
      }
    }

    // ВАЖНО: Префикс ID_ обязателен для работы цикла ожидания в App.tsx
    const finalId = userId || `ID_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const finalUsername = username || finalId;
    const finalDisplayName = fullName || finalUsername;

    return {
      primaryId: finalUsername, 
      tg_id: userId || 'none',
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'ID_ERROR', tg_id: 'none', username: 'none', displayName: 'User' };
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
    const params = new URLSearchParams();
    const tgId = payload.tgUsername || '---';
    
    for (const key in payload) {
      const val = payload[key];
      // Если значение пустое или прочерк, подставляем ID пользователя, чтобы не было пусто в таблице
      const finalVal = (val === undefined || val === null || val === '---' || val === '' || val === 'none') 
        ? tgId 
        : String(val);
      params.append(key, finalVal);
    }

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${params.toString()}`;

    await fetch(finalUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache'
    });
  } catch (e) {}
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

export const analyticsService = {
  logOrder: async (order: any, currentSessionId?: string) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);

    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: `${order.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId,
      phone: order.customerPhone || '---',
      utmSource: order.utmSource || 'direct',
      orderId: orderId,
      dateStr: formatNow(),
      paymentStatus: 'pending',
      agreedToMarketing: order.agreedToMarketing ? 'Да' : 'Нет',
      tgUsername: userInfo.primaryId,
      productId: order.productId || '---'
    });
    
    return { ...order, id: orderId };
  },

  updateOrderStatus: async (orderId: string, status: string) => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      type: 'order_update',
      action: 'update_status',
      orderId: orderId,
      paymentStatus: status === 'paid' ? 'success' : 'failed',
      tgUsername: userInfo.primaryId,
      dateStr: formatNow()
    });
  },

  startSession: async (forcedId?: string): Promise<string> => {
    const userInfo = getDetailedTgUser();
    const tgId = forcedId || userInfo.primaryId;
    const sessionId = `${tgId.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
    globalSessionId = sessionId;
    
    await sendToScript({
      type: 'session_start',
      dateStr: formatNow(),
      // Дублируем ID в город и страну для 100% видимости в вашей таблице
      city: tgId, 
      country: userInfo.username, 
      utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
      sessionId: sessionId,
      tgUsername: tgId
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      type: 'path_update',
      dateStr: formatNow(),
      city: userInfo.primaryId,
      country: userInfo.username,
      path: path,
      sessionId: sessionId || globalSessionId,
      tgUsername: userInfo.primaryId
    });
  }
};
