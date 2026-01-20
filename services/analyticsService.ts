
/**
 * СУПЕРМОЗГ V40: ОКОНЧАТЕЛЬНОЕ ВОССТАНОВЛЕНИЕ
 * Исправляет сдвиг колонок в таблице и возвращает ники/ID.
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

    const userId = userData?.id ? String(userData.id) : (localStorage.getItem('olga_cache_id') || '000000');
    
    let username = '@guest';
    if (userData?.username) {
      username = `@${userData.username.replace(/^@/, '')}`;
    } else if (userData?.id) {
      // Если ника нет — используем ID, чтобы в таблице не было пусто
      username = `@id${userData.id}`;
    } else {
      const cached = localStorage.getItem('olga_cache_nick');
      if (cached && cached !== '@guest') username = cached;
    }

    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    if (userData?.id) {
      localStorage.setItem('olga_cache_id', userId);
      localStorage.setItem('olga_cache_nick', username);
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

    const freshUser = getDetailedTgUser();
    const currentTab = payload.path || payload.city || 'home';

    // СТРОГИЙ ПОРЯДОК ПОЛЕЙ ДЛЯ СКРИПТА (не менять!)
    // 1. date, 2. path, 3. sessionId, 4. tgUsername
    const data: any = {
      date: new Date().toLocaleString('ru-RU'),
      path: currentTab,
      sessionId: payload.sessionId || 'SID_NONE',
      tgUsername: freshUser.username,
      userId: freshUser.tg_id,
      type: payload.type || 'log',
      vkladka: currentTab, // Дублируем для разных версий скрипта
      name: freshUser.displayName
    };

    if (payload.type === 'order') {
      data.product = payload.product;
      data.price = payload.price;
      data.email = payload.email;
    }

    fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data)
    }).catch(() => {});

  } catch (err) {}
};

export const analyticsService = {
  logOrder: async (order: any) => {
    const orderId = `ORD${Date.now()}`;
    await sendToScript({
      type: 'order',
      product: order.productTitle,
      price: order.price,
      email: order.customerEmail,
      sessionId: orderId
    });
    return { ...order, id: orderId };
  },
  startSession: async () => {
    const sid = `SID_${Date.now()}`;
    await sendToScript({ type: 'session_start', sessionId: sid, path: 'home' });
    return sid;
  },
  updateSessionPath: async (sid: string, path: string) => {
    await sendToScript({ type: 'path_update', sessionId: sid, path: path });
  },
  updateOrderStatus: async (id: string, status: string) => {
    await sendToScript({ type: 'status_update', orderId: id, paymentStatus: status });
  }
};
