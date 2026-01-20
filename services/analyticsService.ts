
/**
 * СУПЕРМОЗГ V16: ФИНАЛЬНЫЙ БУЛЛЕТПРУФ
 * Исправлена опечатка в URL вебхука.
 * Реализован захват данных через сырой парсинг window.location.hash.
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v16';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Прямая попытка через SDK
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Глубокий парсинг хэша (если SDK еще не проснулся или это Desktop)
    if (!userId || !username) {
      const hash = window.location.hash.slice(1);
      const search = window.location.search.slice(1);
      const sources = [hash, search, tg?.initData].filter(Boolean);

      for (const src of sources) {
        const params = new URLSearchParams(src!);
        // Проверяем tgWebAppData (стандарт для Mini App)
        let dataStr = params.get('tgWebAppData') || src;
        
        if (dataStr) {
          const dataParams = new URLSearchParams(dataStr);
          const userJson = dataParams.get('user');
          if (userJson) {
            try {
              const u = JSON.parse(decodeURIComponent(userJson));
              if (u.id && !userId) userId = String(u.id);
              if (u.username && !username) username = `@${u.username.replace(/^@/, '')}`;
              if (u.first_name && !fullName) fullName = `${u.first_name} ${u.last_name || ''}`.trim();
            } catch (e) {}
          }
        }
      }
    }

    // 3. Формируем финальный ник (если нет юзернейма - берем ID)
    const finalId = userId || '000000';
    let finalNick = username || `@id${finalId}`;

    // 4. Кэширование для стабильности
    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId: finalId, username: finalNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        finalId === '000000' && (userId = c.userId);
        finalNick === '@id000000' && (finalNick = c.username);
        !fullName && (fullName = c.fullName);
      }
    }

    return {
      primaryId: finalNick,
      tg_id: userId || finalId,
      username: finalNick,
      displayName: fullName || finalNick
    };
  } catch (e) {
    return { primaryId: 'GUEST', tg_id: 'GUEST', username: 'GUEST', displayName: 'User' };
  }
};

const sendToScript = async (payload: any) => {
  const webhook = ((): string => {
    try {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.googleSheetWebhook && parsed.googleSheetWebhook.includes('exec')) {
          return parsed.googleSheetWebhook;
        }
      }
    } catch (e) {}
    return DEFAULT_WEBHOOK;
  })();

  try {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;

    // МАППИНГ ПОД ВАШУ ТАБЛИЦУ: city -> Имя (Col B), country -> Email (Col C)
    const cleanPayload = {
      ...payload,
      city: (payload.type === 'path_update') ? payload.city : (payload.city && payload.city !== '---' && !payload.city.includes('home')) ? payload.city : nick,
      country: (payload.country && payload.country !== '---') ? payload.country : nick,
      name: payload.name || userInfo.displayName,
      email: payload.email || nick,
      username: nick,
      tgUsername: nick
    };

    const query = new URLSearchParams();
    Object.keys(cleanPayload).forEach(key => {
      let v = String(cleanPayload[key]);
      if (v === 'undefined' || v === 'null' || v === '---') v = nick;
      query.append(key, v);
    });

    const url = `${webhook}${webhook.includes('?') ? '&' : '?'}${query.toString()}`;
    await fetch(url, { method: 'POST', mode: 'no-cors', cache: 'no-cache' });
  } catch (e) {}
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: order.customerName,
      email: order.customerEmail,
      orderId,
      dateStr: new Date().toLocaleString('ru-RU')
    });
    return { ...order, id: orderId };
  },

  startSession: async (forcedId?: string) => {
    const userInfo = getDetailedTgUser();
    const nick = forcedId || userInfo.username;
    const sid = `${nick.replace(/[^a-z0-9]/gi, '')}_${Date.now().toString(36)}`;
    await sendToScript({
      type: 'session_start',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: nick, 
      country: nick,
      sessionId: sid
    });
    return sid;
  },

  updateSessionPath: async (sid: string, path: string) => {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;
    await sendToScript({
      type: 'path_update',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: path, 
      country: nick,
      sessionId: sid
    });
  },

  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({
      type: 'order_update',
      orderId: id,
      paymentStatus: status === 'paid' ? 'success' : 'failed',
      dateStr: new Date().toLocaleString('ru-RU')
    });
  }
};
