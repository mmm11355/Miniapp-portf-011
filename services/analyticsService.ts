
/**
 * СУПЕРМОЗГ V18: ОКОНЧАТЕЛЬНЫЙ ЗАХВАТ
 * Рекурсивный парсинг для захвата ника на 100% устройств.
 */

import { Session, OrderLog } from '../types';

const CACHED_USER_KEY = 'olga_tg_final_v18';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';
const FALLBACK_ID = '000000';

/**
 * Рекурсивно ищет объект 'user' в строке параметров
 */
const findUserInString = (str: string): any => {
  if (!str) return null;
  try {
    const params = new URLSearchParams(str.replace(/^#/, '').replace(/^\?/, ''));
    
    // 1. Прямой поиск user
    const userJson = params.get('user');
    if (userJson) return JSON.parse(decodeURIComponent(userJson));
    
    // 2. Поиск во вложенном tgWebAppData (часто на Desktop)
    const tgData = params.get('tgWebAppData');
    if (tgData) return findUserInString(decodeURIComponent(tgData));
    
    // 3. Поиск в остальных параметрах (на всякий случай)
    for (const [key, value] of params.entries()) {
      if (value && (value.includes('%7B') || value.includes('{'))) {
        try {
          const decoded = decodeURIComponent(value);
          if (decoded.includes('"id":')) return JSON.parse(decoded);
        } catch (e) {}
      }
    }
  } catch (e) {}
  return null;
};

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData: any = null;

    // ШАГ 1: Проверка SDK
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    // ШАГ 2: Если SDK пуст, сканируем URL (актуально для PC и старых версий)
    if (!userData) {
      const sources = [
        window.location.hash,
        window.location.search,
        tg?.initData
      ].filter(Boolean);

      for (const src of sources) {
        userData = findUserInString(src!);
        if (userData) break;
      }
    }

    // ШАГ 3: Формирование ника и ID
    let userId = userData?.id ? String(userData.id) : null;
    let username = userData?.username ? `@${userData.username.replace(/^@/, '')}` : null;
    let fullName = `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim();

    // Если ника нет, но есть ID — делаем ник из ID
    const stableId = userId || FALLBACK_ID;
    const stableNick = username || (userId ? `@id${userId}` : `@guest_${FALLBACK_ID}`);

    // ШАГ 4: Кэширование (чтобы не терять данные при обновлении)
    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId: stableId, username: stableNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        return {
          primaryId: c.username,
          tg_id: c.userId,
          username: c.username,
          displayName: c.fullName || c.username
        };
      }
    }

    return {
      primaryId: stableNick,
      tg_id: stableId,
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
        if (parsed.googleSheetWebhook?.includes('exec')) return parsed.googleSheetWebhook;
      }
    } catch (e) {}
    return DEFAULT_WEBHOOK;
  })();

  try {
    const userInfo = getDetailedTgUser();
    const nick = userInfo.username;

    // МАППИНГ ДЛЯ ТАБЛИЦЫ: city -> Имя, country -> Email
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
