
/**
 * СУПЕРМОЗГ V14: БУЛЛЕТПРУФ ЗАХВАТ ДАННЫХ
 * Исправлена проблема Desktop-версии (двойная вложенность в URL Hash)
 * Маппинг: Column B (Имя) <- city, Column C (Email) <- country
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v14';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Способ для МОБИЛОК (Прямой объект)
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Способ для ПК (Двойная распаковка из URL)
    if (!userId || !username) {
      const fullUrl = window.location.href;
      const hash = window.location.hash.replace('#', '');
      const search = window.location.search.replace('?', '');
      
      // Ищем везде: в initData, в hash, в поиске
      [tg?.initData, hash, search].forEach(source => {
        if (!source) return;
        const params = new URLSearchParams(source);
        
        // Telegram на ПК часто кладет всё в tgWebAppData
        const webAppData = params.get('tgWebAppData');
        const finalSource = webAppData ? new URLSearchParams(webAppData) : params;
        
        const userJson = finalSource.get('user');
        if (userJson) {
          try {
            const u = JSON.parse(decodeURIComponent(userJson));
            if (!userId && u.id) userId = String(u.id);
            if (!username && u.username) username = `@${u.username.replace(/^@/, '')}`;
            if (!fullName) fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
          } catch (e) {}
        }
      });
    }

    // 3. Если всё еще нет ника, но есть ID — используем ID
    const stableId = userId || 'GUEST';
    // FIX: Changed stableNick from const to let to allow reassignment from cache below
    let stableNick = username || `@id${stableId}`;

    // 4. Кэширование
    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username: stableNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        userId = c.userId; stableNick = c.username; fullName = c.fullName;
      }
    }

    return {
      primaryId: stableNick,
      tg_id: userId || stableId,
      username: stableNick,
      displayName: fullName || stableNick
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

    // ГАРАНТИЯ: заполняем city и country ником, так как они идут в Имя и Email в вашей таблице
    const cleanPayload = {
      ...payload,
      city: (payload.city && payload.city !== '---' && !payload.city.includes('home')) ? payload.city : nick,
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
      city: nick, // В колонку Имя
      country: nick, // В колонку Email
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
      city: path, // Видим путь в колонке Имя
      country: nick, // Видим КТО это в колонке Email
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
