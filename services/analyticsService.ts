
/**
 * СУПЕРМОЗГ V30: ГАРАНТИЯ НИКА
 * Приоритет ника над ID для Sessions и Permissions.
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
    
    // ПРИОРИТЕТ: Ник > Кэшированный ник > ID
    let username = '@guest';
    if (userData?.username) {
      username = `@${userData.username.replace(/^@/, '')}`;
    } else if (localStorage.getItem('olga_cache_nick') && localStorage.getItem('olga_cache_nick') !== 'undefined') {
      username = localStorage.getItem('olga_cache_nick')!;
    } else if (userData?.id) {
      username = String(userData.id); // Если ника нет, используем ID без @
    }

    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    // Обновляем кэш только если данные реальные
    if (userData?.id) {
      localStorage.setItem('olga_cache_id', userId);
      if (userData.username) {
        localStorage.setItem('olga_cache_nick', `@${userData.username.replace(/^@/, '')}`);
      }
      localStorage.setItem('olga_cache_name', fullName);
    }

    return { 
      tg_id: userId, 
      username: username, 
      displayName: fullName 
    };
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

    const userInfo = getDetailedTgUser();
    
    // ВАЖНО: utmSource — это то, что идет в колонку D листа Sessions
    // Мы принудительно ставим туда username (ник)
    const data: any = {
      ...payload,
      tgUsername: userInfo.username,
      dateStr: new Date().toLocaleString('ru-RU'),
      utmSource: userInfo.username // Здесь теперь ВСЕГДА ник, если он есть
    };

    fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    }).catch(e => console.error('Log error:', e));

    console.log(`🚀 [SENT] -> ${data.type} | User: ${userInfo.username}`);
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
