
/**
 * СУПЕРМОЗГ V35: ФИНАЛЬНАЯ СИНХРОНИЗАЦИЯ
 * Гарантирует правильный маппинг вкладок в Sessions и доступов в Permissions.
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
    const userInfo = getDetailedTgUser();
    
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

    const freshUser = getDetailedTgUser();
    
    // ГАРАНТИЯ: Если путь не задан или это старт — всегда ставим 'home'
    // Если передан path, используем его. Это исключает запись SID в поле вкладки.
    const currentPath = payload.path || payload.city || (payload.type === 'session_start' ? 'home' : '');

    const data: any = {
      ...payload,
      // Дублируем вкладку во все поля, чтобы таблица точно её увидела
      city: currentPath,
      path: currentPath,
      page: currentPath,
      vkladka: currentPath,
      
      tgUsername: freshUser.username,
      utmSource: freshUser.username,
      userId: freshUser.tg_id,
      dateStr: new Date().toLocaleString('ru-RU')
    };

    fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    }).catch(e => console.error('Log error:', e));

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
      orderId: orderId,
      paymentStatus: 'pending',
      tgUsername: userInfo.username
    });
    return { ...order, id: orderId };
  },
  startSession: async () => {
    const sid = `SID_${Date.now()}`;
    // Явно указываем city: 'home', чтобы в таблице не было SID вместо вкладки
    await sendToScript({ type: 'session_start', sessionId: sid, city: 'home', path: 'home' });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    // Явно передаем путь и в city, и в path
    await sendToScript({ type: 'path_update', sessionId: sid, path: path, city: path });
  },
  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({ type: 'status_update', orderId: id, paymentStatus: status });
  }
};
