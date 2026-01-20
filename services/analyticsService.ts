
/**
 * СУПЕРМОЗГ V13: ОКОНЧАТЕЛЬНАЯ ФИКСАЦИЯ НИКА
 * Маппинг под вашу таблицу (Скриншот): 
 * Column B (Имя) <- параметр 'city'
 * Column C (Email) <- параметр 'country'
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v13';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Попытка через стандартный объект (Mobile)
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Глубокий разбор initData (Desktop/PC)
    const initData = tg?.initData || "";
    const searchSource = initData || window.location.hash || window.location.search;
    
    if (searchSource && !username) {
      // Пытаемся вытащить JSON юзера из параметров
      const params = new URLSearchParams(searchSource.replace(/^#/, ''));
      const userParam = params.get('user') || params.get('tgWebAppStartParam');
      
      if (userParam) {
        try {
          const parsed = JSON.parse(decodeURIComponent(userParam));
          if (parsed.username) username = `@${parsed.username.replace(/^@/, '')}`;
          if (!userId) userId = parsed.id ? String(parsed.id) : null;
          if (!fullName) fullName = `${parsed.first_name || ''} ${parsed.last_name || ''}`.trim();
        } catch (e) {
          // Если не JSON, пробуем регуляркой прямо по строке
          const nickMatch = searchSource.match(/username["%22]*:?["%22]*([^"%&]+)/);
          if (nickMatch && nickMatch[1]) username = `@${decodeURIComponent(nickMatch[1]).replace(/^@/, '')}`;
        }
      }
    }

    // 3. Последний шанс: поиск по всей строке URL/Hash
    if (!username) {
      const raw = decodeURIComponent(window.location.href);
      const m = raw.match(/"username":"([^"]+)"/) || raw.match(/username":"([^"]+)"/);
      if (m) username = `@${m[1].replace(/^@/, '')}`;
    }

    // 4. Кэш
    if (username && !username.includes('ID_')) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        username = c.username; userId = c.userId; fullName = c.fullName;
      }
    }

    const finalNick = username || (userId ? `ID_${userId}` : `GUEST_${Math.random().toString(36).substr(2, 4).toUpperCase()}`);

    return {
      primaryId: finalNick, 
      tg_id: userId || finalNick,
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
      if (saved) return JSON.parse(saved).googleSheetWebhook || DEFAULT_WEBHOOK;
    } catch (e) {}
    return DEFAULT_WEBHOOK;
  })();

  try {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;

    // ПРИНУДИТЕЛЬНЫЙ МАППИНГ ПОД КОЛОНКИ ТАБЛИЦЫ (B и C)
    // Параметр 'city' попадает в колонку Имя (B)
    // Параметр 'country' попадает в колонку Email (C)
    const cleanPayload = {
      ...payload,
      // Если мы в режиме сессии, city/country могут быть переопределены
      city: payload.city && payload.city !== '---' && !payload.city.includes('ID_') ? payload.city : nick,
      country: payload.country && payload.country !== '---' && !payload.country.includes('ID_') ? payload.country : nick,
      // Для заказов (другие листы)
      name: payload.name || nick,
      email: payload.email || nick,
      tgUsername: nick,
      username: nick
    };

    const query = new URLSearchParams();
    Object.keys(cleanPayload).forEach(key => {
      let val = String(cleanPayload[key]);
      if (val === 'undefined' || val === 'null' || val === '---') val = nick;
      query.append(key, val);
    });

    const url = `${webhook}${webhook.includes('?') ? '&' : '?'}${query.toString()}`;

    // no-cors для Google Apps Script
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
      phone: order.customerPhone || '---',
      utmSource: order.utmSource || 'direct',
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
      city: nick, // В колонку "Имя"
      country: nick, // В колонку "Email"
      utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
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
      city: path, // В колонку "Имя" (чтобы видеть где ходит)
      country: nick, // В колонку "Email" (чтобы видеть КТО ходит)
      path: path,
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
