
/**
 * СУПЕРМОЗГ V31: ГАРАНТИЯ ДАННЫХ
 * Исправляет пропуски ника и вкладок в Sessions.
 */

const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) tg.ready();

    let userData: any = null;
    if (tg?.initDataUnsafe?.user) {
      userData = tg.initDataUnsafe.user;
    }

    if (!userData) {
      const urlPart = window.location.hash || window.location.search;
      const match = urlPart.match(/user=({.*?})/);
      if (match) {
        try { userData = JSON.parse(decodeURIComponent(match[1])); } catch (e) {}
      }
    }

    const userId = userData?.id ? String(userData.id) : (localStorage.getItem('olga_cache_id') || '000000');
    
    // ПРИОРИТЕТ: Реальный ник из TG > Кэш > ID
    let username = '@guest';
    if (userData?.username) {
      username = `@${userData.username.replace(/^@/, '')}`;
    } else {
      const cached = localStorage.getItem('olga_cache_nick');
      if (cached && cached !== 'undefined' && cached !== '@guest') {
        username = cached;
      } else if (userData?.id) {
        username = `@id${userData.id}`;
      }
    }

    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    if (userData?.id) {
      localStorage.setItem('olga_cache_id', userId);
      if (userData.username) {
        localStorage.setItem('olga_cache_nick', `@${userData.username.replace(/^@/, '')}`);
      } else {
        localStorage.setItem('olga_cache_nick', `@id${userData.id}`);
      }
      localStorage.setItem('olga_cache_name', fullName);
    }

    return { tg_id: userId, username: username, displayName: fullName };
  } catch (e) {
    return { tg_id: '000000', username: '@guest', displayName: 'User' };
  }
};

const sendToScript = async (payload: any) => {
  try {
    const webhook = ((): string => {
      const saved = localStorage.getItem('olga_tg_config');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.googleSheetWebhook?.includes('exec')) return parsed.googleSheetWebhook;
        } catch (e) {}
      }
      return DEFAULT_WEBHOOK;
    })();

    // Небольшая пауза для инициализации TG SDK при первом запуске
    if (payload.type === 'session_start') {
      await new Promise(r => setTimeout(r, 500));
    }

    const userInfo = getDetailedTgUser();
    
    // Формируем максимально подробный объект, чтобы скрипт точно нашел вкладку и ник
    const data: any = {
      ...payload,
      // Дублируем поля пути для разных версий скриптов
      city: payload.city || payload.path || 'home',
      path: payload.city || payload.path || 'home',
      page: payload.city || payload.path || 'home',
      
      tgUsername: userInfo.username,
      dateStr: new Date().toLocaleString('ru-RU'),
      // utmSource идет в колонку D/E в зависимости от настроек вашего скрипта
      utmSource: userInfo.username,
      userId: userInfo.tg_id
    };

    fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    }).catch(e => console.error('Log error:', e));

    console.log(`🚀 [LOG] ${data.type} | Path: ${data.city} | User: ${data.utmSource}`);
  } catch (err) {
    console.error('Send error:', err);
  }
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const orderId = `ORD${Date.now()}`;
    const userInfo = getDetailedTgUser();
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone || '---',
      orderId: orderId,
      paymentStatus: 'pending',
      agreedToMarketing: order.agreedToMarketing ? 'Да' : 'Нет',
      tgUsername: userInfo.username,
      productId: order.productId || 'none'
    });
    return { ...order, id: orderId };
  },
  startSession: async (forcedId?: string) => {
    const sid = `SID_${Date.now()}`;
    await sendToScript({
      type: 'session_start',
      city: 'home',
      country: 'RU',
      sessionId: sid
    });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    await sendToScript({
      type: 'path_update',
      city: path,
      path: path,
      country: 'RU',
      sessionId: sid
    });
  },
  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({
      type: 'status_update',
      orderId: id,
      paymentStatus: status
    });
  }
};
