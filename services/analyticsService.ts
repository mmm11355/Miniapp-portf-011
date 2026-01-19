
import { Session, OrderLog } from '../types';

const STORAGE_KEY = 'olga_analytics_sessions_v2';
const DEFAULT_WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

export const getDetailedTgUser = () => {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
    }
    const user = tg?.initDataUnsafe?.user;
    
    // Если объект user пуст (бывает при медленной загрузке), пробуем достать ID из initData
    let id = user?.id ? String(user.id) : null;
    const username = user?.username ? `@${user.username}` : null;
    const firstName = user?.first_name || '';
    const lastName = user?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    // ГАРАНТИРОВАННЫЙ ID: если ника нет, ID становится главным идентификатором
    const finalId = username || id || 'guest';

    return {
      primaryId: finalId, // Это пойдет в Email/Username
      tg_id: id || finalId, // Это пойдет в ТГ ID
      username: username || id || 'none',
      displayName: fullName || username || id || 'Пользователь'
    };
  } catch (e) {
    return { primaryId: 'guest', tg_id: 'none', username: 'none', displayName: 'Гость' };
  }
};

const getWebhookUrl = () => {
  try {
    const config = localStorage.getItem('olga_tg_config');
    if (config) {
      const parsed = JSON.parse(config);
      if (parsed.googleSheetWebhook && parsed.googleSheetWebhook.trim() !== '') {
        return parsed.googleSheetWebhook;
      }
    }
  } catch (e) {}
  return DEFAULT_WEBHOOK;
};

const sendToScript = async (payload: any) => {
  const webhook = getWebhookUrl();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
};

let globalSessionId: string | null = null;
const formatNow = () => new Date().toLocaleString('ru-RU');

export const analyticsService = {
  logOrder: async (order: Omit<OrderLog, 'id' | 'timestamp' | 'paymentStatus'>, currentSessionId?: string) => {
    const timestamp = Date.now();
    const userInfo = getDetailedTgUser();
    const newOrder: OrderLog = {
      ...order,
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      tgUsername: userInfo.primaryId,
      paymentStatus: 'pending'
    };

    await sendToScript({
      action: 'log',
      type: 'order',
      sessionId: currentSessionId || globalSessionId || 'unknown',
      orderId: newOrder.id,
      name: `${newOrder.customerName} (${userInfo.displayName})`,
      email: userInfo.primaryId,
      username: userInfo.username,
      tg_id: userInfo.tg_id,
      product: newOrder.productTitle,
      price: newOrder.price,
      utmSource: newOrder.utmSource,
      dateStr: formatNow()
    });
    
    return newOrder;
  },

  updateOrderStatus: async (orderId: string, status: 'paid' | 'failed') => {
    const userInfo = getDetailedTgUser();
    await sendToScript({
      action: 'update_status',
      type: 'order',
      orderId: orderId,
      status: status,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      dateStr: formatNow()
    });
  },

  startSession: async (forcedUsername?: string): Promise<string> => {
    const userInfo = getDetailedTgUser();
    const tgId = forcedUsername || userInfo.primaryId;
    
    // Формируем sessionId аккуратно
    const safeId = tgId.replace(/[^a-zA-Z0-9]/g, '') || 'user';
    const sessionId = `${safeId}_${Math.random().toString(36).substr(2, 4)}`;
    globalSessionId = sessionId;
    
    const params = new URLSearchParams(window.location.search);
    
    await sendToScript({
      action: 'log',
      type: 'session_start',
      sessionId: sessionId,
      name: userInfo.displayName === 'Пользователь' ? tgId : userInfo.displayName,
      email: tgId,
      tgUsername: tgId,
      tg_id: userInfo.tg_id,
      username: userInfo.username,
      utmSource: params.get('utm_source') || 'direct',
      dateStr: formatNow()
    });

    return sessionId;
  },

  updateSessionPath: async (sessionId: string, path: string) => {
    const userInfo = getDetailedTgUser();
    const sId = sessionId && sessionId !== 'session' ? sessionId : (globalSessionId || 'unknown');
    
    await sendToScript({
      action: 'log',
      type: 'path_update',
      sessionId: sId,
      name: userInfo.displayName === 'Пользователь' ? userInfo.primaryId : userInfo.displayName,
      email: userInfo.primaryId,
      tgUsername: userInfo.primaryId,
      tg_id: userInfo.tg_id,
      path: path,
      dateStr: formatNow()
    });
  }
};
