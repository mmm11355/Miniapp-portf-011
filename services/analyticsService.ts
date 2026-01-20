
/**
 * СУПЕРМОЗГ V12: ГАРАНТИРОВАННЫЙ ЗАХВАТ НИКА
 * Маппинг данных строго под колонки таблицы: Имя, Email
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v12';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Попытка через объект user (Mobile)
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Глубокий разбор для Desktop/PC
    const initData = tg?.initData || "";
    if (initData && (!username || username.includes('ID_'))) {
      const params = new URLSearchParams(initData);
      const userParam = params.get('user');
      if (userParam) {
        try {
          const parsed = JSON.parse(decodeURIComponent(userParam));
          if (parsed.username) username = `@${parsed.username.replace(/^@/, '')}`;
          if (!userId) userId = parsed.id ? String(parsed.id) : null;
          if (!fullName) fullName = `${parsed.first_name || ''} ${parsed.last_name || ''}`.trim();
        } catch (e) {}
      }
    }

    // 3. Если всё еще нет ника - ищем в хеше URL
    if (!username) {
      const hash = window.location.hash;
      const nickMatch = hash.match(/"username":"([^"]+)"/) || hash.match(/username%22%3A%22([^%]+)%22/);
      if (nickMatch) username = `@${decodeURIComponent(nickMatch[1]).replace(/^@/, '')}`;
    }

    // 4. Кэширование для стабильности
    if (username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        username = c.username; userId = c.userId; fullName = c.fullName;
      }
    }

    const finalNick = username || (userId ? `ID_${userId}` : `GUEST_${Math.random().toString(36).substr(2, 4)}`);

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

    // ПРИНУДИТЕЛЬНЫЙ МАППИНГ ПОД КОЛОНКИ ТАБЛИЦЫ
    // Если в name или email пусто/Unknown/---, пишем туда НИКНЕЙМ
    const cleanPayload = {
      ...payload,
      // Колонка "Имя" (B)
      name: (payload.name && payload.name !== '---' && !payload.name.toLowerCase().includes('unknown')) 
            ? payload.name : nick,
      // Колонка "Email" (C)
      email: (payload.email && payload.email !== '---' && !payload.email.toLowerCase().includes('unknown'))
            ? payload.email : nick,
      // Для подстраховки в другие поля
      tgUsername: nick,
      username: nick,
      city: payload.city || nick,
      country: payload.country || userInfo.displayName
    };

    const query = new URLSearchParams();
    Object.keys(cleanPayload).forEach(key => query.append(key, String(cleanPayload[key])));

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
      name: order.customerName, // sendToScript сам заменит на ник если тут пусто
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
      city: nick, // Пойдет в колонку "Имя" или "Email"
      country: userInfo.displayName,
      utmSource: new URLSearchParams(window.location.search).get('utm_source') || 'direct',
      sessionId: sid
    });
    return sid;
  },

  updateSessionPath: async (sid: string, path: string) => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      type: 'path_update',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: path,
      country: userInfo.username,
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
