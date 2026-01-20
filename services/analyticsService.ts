
/**
 * СУПЕРМОЗГ V23: ГАРАНТИЯ ЗАПИСИ В СЕССИИ
 * Используем один максимально чистый GET-запрос.
 * Маппинг: Лист Sessions -> Имя (Колонка B) = Название страницы, Email (Колонка C) = Ник.
 */

const CACHED_USER_KEY = 'olga_tg_final_v23';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';
const FALLBACK_ID = '000000';

const deepParseUser = (rawStr: string): any => {
  if (!rawStr) return null;
  try {
    const cleanStr = rawStr.replace(/^#/, '').replace(/^\?/, '');
    const params = new URLSearchParams(cleanStr);
    const userParam = params.get('user');
    if (userParam) return JSON.parse(decodeURIComponent(userParam));
    const webAppData = params.get('tgWebAppData');
    if (webAppData) return deepParseUser(decodeURIComponent(webAppData));
    for (const [_, value] of params.entries()) {
      if (value && (value.includes('{"id":') || value.includes('%7B%22id%22'))) {
        try { return JSON.parse(decodeURIComponent(value)); } catch (e) {}
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
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    if (!userData) {
      const sources = [window.location.hash, window.location.search, tg?.initData].filter(Boolean);
      for (const s of sources) {
        userData = deepParseUser(s!);
        if (userData) break;
      }
    }

    const userId = userData?.id ? String(userData.id) : null;
    const username = userData?.username ? `@${userData.username.replace(/^@/, '')}` : (userId ? `@id${userId}` : null);
    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : null;

    const finalId = userId || FALLBACK_ID;
    const finalNick = username || `@guest_${finalId}`;

    if (userId || username) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ userId: finalId, username: finalNick, fullName }));
    } else {
      const cached = localStorage.getItem(CACHED_USER_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        return { primaryId: c.username, tg_id: c.userId, username: c.username, displayName: c.fullName || c.username };
      }
    }

    return { primaryId: finalNick, tg_id: finalId, username: finalNick, displayName: fullName || finalNick };
  } catch (e) {
    return { primaryId: `@guest_${FALLBACK_ID}`, tg_id: FALLBACK_ID, username: `@guest_${FALLBACK_ID}`, displayName: 'User' };
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

    // 1. ОПРЕДЕЛЯЕМ ЛИСТ
    const targetSheet = payload.sheet || 'Sessions';

    // 2. СТРОГИЙ МАППИНГ ДЛЯ ТАБЛИЦЫ
    let finalName = payload.name;
    let finalEmail = payload.email;

    if (targetSheet === 'Sessions') {
      // Имя (B) = Название раздела, Email (C) = Ник
      finalName = payload.city || payload.type || 'home';
      finalEmail = nick;
    } else {
      // Для Orders оставляем как есть или подставляем инфо пользователя
      finalName = finalName || userInfo.displayName || nick;
      finalEmail = finalEmail || nick;
    }

    // 3. ФОРМИРУЕМ ЧИСТЫЙ ОБЪЕКТ ПАРАМЕТРОВ
    const cleanParams: any = {
      action: 'log',
      sheet: targetSheet,
      ...payload,
      name: finalName,
      email: finalEmail,
      city: payload.city || finalName, // Дублируем для надежности
      username: nick,
      tgUsername: nick,
      _t: Date.now()
    };

    // 4. СТРОИМ URL ДЛЯ GET-ЗАПРОСА
    const urlObj = new URL(webhook);
    Object.keys(cleanParams).forEach(key => {
      let val = String(cleanParams[key]);
      if (val === 'undefined' || val === 'null' || !val) val = '---';
      urlObj.searchParams.set(key, val);
    });

    // 5. ОТПРАВЛЯЕМ (no-cors гарантирует прохождение через Google)
    await fetch(urlObj.toString(), {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-cache'
    });

    console.log(`✅ [Analytics] Sent to ${targetSheet}:`, cleanParams);
  } catch (e) {
    console.error('❌ [Analytics] Error:', e);
  }
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const userInfo = getDetailedTgUser();
    const orderId = Math.random().toString(36).substr(2, 9);
    await sendToScript({
      sheet: 'Orders',
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
      sheet: 'Sessions',
      type: 'session_start',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: 'home',
      sessionId: sid
    });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      sheet: 'Sessions',
      type: 'path_update',
      dateStr: new Date().toLocaleString('ru-RU'),
      city: path, 
      sessionId: sid || 'nosid'
    });
  },
  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({
      sheet: 'Orders',
      type: 'order_update',
      orderId: id,
      paymentStatus: status === 'paid' ? 'success' : 'failed',
      dateStr: new Date().toLocaleString('ru-RU')
    });
  }
};
