
/**
 * СУПЕРМОЗГ V17: БУЛЛЕТПРУФ ЗАХВАТ
 * Исправлен захват для Desktop и синхронизированы маркеры ожидания.
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v17';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

// Унифицированный маркер отсутствия данных (для синхронизации с App.tsx)
const FALLBACK_ID = '000000';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userId: string | null = null;
    let username: string | null = null;
    let fullName: string | null = null;

    // 1. Попытка через официальный SDK (Mobile)
    const userObj = tg?.initDataUnsafe?.user;
    if (userObj) {
      userId = userObj.id ? String(userObj.id) : null;
      username = userObj.username ? `@${userObj.username.replace(/^@/, '')}` : null;
      fullName = `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
    }

    // 2. Глубокий парсинг URL (Desktop + Резерв для Mobile)
    if (!userId || !username) {
      const hash = window.location.hash.slice(1);
      const search = window.location.search.slice(1);
      const initData = tg?.initData || '';
      const sources = [hash, search, initData].filter(Boolean);

      for (const src of sources) {
        const params = new URLSearchParams(src!);
        
        // Telegram Desktop часто кладет параметры в tgWebAppData
        let effectiveData = src!;
        if (params.has('tgWebAppData')) {
          effectiveData = decodeURIComponent(params.get('tgWebAppData')!);
        }
        
        const finalParams = new URLSearchParams(effectiveData);
        const userJson = finalParams.get('user');
        
        if (userJson) {
          try {
            const u = JSON.parse(decodeURIComponent(userJson));
            if (u.id && !userId) userId = String(u.id);
            if (u.username && !username) username = `@${u.username.replace(/^@/, '')}`;
            if (u.first_name && !fullName) fullName = `${u.first_name} ${u.last_name || ''}`.trim();
          } catch (e) {}
        }
        if (userId || username) break;
      }
    }

    // 3. Формирование финальных данных
    const stableId = userId || FALLBACK_ID;
    let stableNick = username || (userId ? `@id${userId}` : `@guest_${FALLBACK_ID}`);

    // 4. Кэширование
    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId, username: stableNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        if (stableId === FALLBACK_ID) userId = c.userId;
        if (stableNick.includes(FALLBACK_ID)) stableNick = c.username;
        fullName = c.fullName;
      }
    }

    return {
      primaryId: stableNick,
      tg_id: userId || FALLBACK_ID,
      username: stableNick,
      displayName: fullName || stableNick
    };
  } catch (e) {
    return { primaryId: '@error', tg_id: FALLBACK_ID, username: '@error', displayName: 'User' };
  }
};

const sendToScript = async (payload: any) => {
  const webhook = ((): string => {
    try {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.googleSheetWebhook && parsed.googleSheetWebhook.includes('exec')) return parsed.googleSheetWebhook;
      }
    } catch (e) {}
    return DEFAULT_WEBHOOK;
  })();

  try {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;

    // МАППИНГ: city -> Имя, country -> Email
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
