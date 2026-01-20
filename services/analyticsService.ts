
/**
 * СУПЕРМОЗГ V38: ВОЗВРАТ НИКОВ И СТАБИЛЬНОСТИ
 * Исправляет отображение ников в Sessions и восстанавливает связь со скриптом.
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

    // Если нет данных от TG, ищем в кэше, но не даем кэшу перекрыть свежие данные
    const userId = userData?.id ? String(userData.id) : (localStorage.getItem('olga_cache_id') || '000000');
    
    let username = '@guest';
    if (userData?.username) {
      username = `@${userData.username.replace(/^@/, '')}`;
    } else {
      const cached = localStorage.getItem('olga_cache_nick');
      if (cached && cached !== '@guest' && cached !== 'undefined') {
        username = cached;
      } else if (userData?.id) {
        username = `@id${userData.id}`;
      }
    }

    const fullName = userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() : (localStorage.getItem('olga_cache_name') || 'User');

    // Обновляем кэш только если данные валидны
    if (userData?.id) {
      localStorage.setItem('olga_cache_id', String(userData.id));
      if (userData.username) localStorage.setItem('olga_cache_nick', `@${userData.username}`);
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
    const currentPath = payload.path || payload.city || 'home';

    // ВАЖНО: Используем ТЕ ЖЕ ключи, что были в самой первой рабочей версии
    const data: any = {
      date: new Date().toLocaleString('ru-RU'),
      path: currentPath,
      city: currentPath,
      vkladka: currentPath,
      type: payload.type,
      tgUsername: freshUser.username,
      sessionId: payload.sessionId || '', 
      userId: freshUser.tg_id,
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
    }).catch(e => console.log('Silent log failed'));

  } catch (err) {
    console.error('Analytics Error:', err);
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
