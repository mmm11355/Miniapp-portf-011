
/**
 * СУПЕРМОЗГ: ИСПРАВЛЕННЫЙ GOOGLE SCRIPT (Для doPost в таблице)
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_cached_tg_user_v9';
// ВАШ ТЕКУЩИЙ WEBHOOK
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Попытка через официальный объект (Mobile)
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. ГЛУБОКИЙ ПАРСИНГ (Desktop + Fallback)
    if (!userId || !username) {
      const rawData = tg?.initData || window.location.hash.slice(1) || window.location.search.slice(1);
      if (rawData) {
        const params = new URLSearchParams(rawData);
        const userJson = params.get('user');
        
        if (userJson) {
          try {
            const u = JSON.parse(decodeURIComponent(userJson));
            if (!userId) userId = u.id ? String(u.id) : null;
            if (!username) username = u.username ? `@${u.username.replace(/^@/, '')}` : null;
            if (!fullName) fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
          } catch (e) {}
        }

        // Если через JSON не вышло, добиваем регулярками
        if (!userId) {
          const idMatch = rawData.match(/id=(\d+)/) || rawData.match(/"id":(\d+)/);
          if (idMatch) userId = idMatch[1];
        }
        if (!username) {
          const userMatch = rawData.match(/username=([^&]+)/) || rawData.match(/"username":"([^"]+)"/);
          if (userMatch) username = `@${decodeURIComponent(userMatch[1]).replace(/^@/, '')}`;
        }
      }
    }

    // 3. Кэширование
    if (userId || username) {
      const current = { 
        userId: userId || (username ? `UID_${username.replace('@','')}` : null), 
        username, 
        fullName 
      };
      if (current.userId) localStorage.setItem(CACHED_USER_KEY, JSON.stringify(current));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        userId = c.userId;
        username = c.username;
        fullName = c.fullName;
      }
    }

    // ГАРАНТИЯ: Если данных совсем нет, создаем временный ID с префиксом ID_
    // Это заставляет App.tsx ждать 2 сек, пока Telegram проснется
    const tempId = `ID_${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const finalId = userId || tempId;
    const finalUsername = username || finalId;
    const finalDisplayName = fullName || finalUsername;

    return {
      primaryId: finalUsername, 
      tg_id: finalId, 
      username: finalUsername,
      displayName: finalDisplayName
    };
  } catch (e) {
    return { primaryId: 'ID_ERROR', tg_id: 'ID_ERROR', username: 'none', displayName: 'User' };
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
    const fallbackId = payload.tgUsername || payload.email || '---';
    
    for (const key in payload) {
      let val = payload[key];
      // Проверка на пустоту
      if (val === undefined || val === null || val === '' || val === 'none' || String(val).startsWith('ID_')) {
        val = fallbackId;
      }
      params.append(key, String(val));
    }

    const finalUrl = `${webhook}${webhook.includes('?') ? '&' : '?'}${params.toString()}`;

    // Используем POST с параметрами в URL - это самый надежный способ для Google Apps Script
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
      city: tgId, 
      country: userInfo.displayName, 
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
      country: userInfo.displayName,
      path: path,
      sessionId: sessionId || globalSessionId,
      tgUsername: userInfo.primaryId
    });
  }
};
