import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Users, CreditCard, Activity } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  const parseDate = (val: any) => {
    if (!val) return 0;
    const s = String(val);
    if (!isNaN(Number(s)) && s.length > 10) return Number(s);
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) {
      const time = s.split(',')[1]?.trim() || '00:00:00';
      return new Date(`${m[3]}-${m[2]}-${m[1]}T${time}`).getTime();
    }
    return new Date(s).getTime() || 0;
  };

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${WEBHOOK}?action=getStats&_t=${Date.now()}`);
      const data = await res.json();
      // Исправлено: напрямую берем sessions и leads из ответа скрипта
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) {
      console.error("Ошибка загрузки");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(inv);
  }, []);

  const { filteredStats, processedLeads } = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();

    const allLeads = (leads || []).map(l => {
      const ts = parseDate(l.timestamp || l['Дата']);
      const status = String(l.PaymentStatus || l['Статус'] || '').toLowerCase();
      return {
        ...l, ts,
        isPaid: status === 'да' || status.includes('оплат'),
        isFailed: status === 'нет' || status.includes('отмена') || status.includes('архив'),
        title: l.productTitle || l['Товар'] || 'Без названия',
        price: l.price || l['Сумма'] || '0',
        user: l.customerEmail || l['Email'] || 'Гость',
        dateStr: ts > 0 ? new Date(ts).toLocaleDateString('ru-RU') : '---'
      };
    });

    let limit = 0;
    if (period === 'today') limit = startOfToday;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    const fLeads = allLeads.filter(l => period === 'all' || l.ts >= limit);
    // Фильтр визитов по колонке "Дата"
    const fSessions = (sessions || []).filter(s => parseDate(s['Дата']) >= limit);

    const nicks: Record<string, number> = {};
    fSessions.forEach(s => {
      const nick = s['Email'] || s['Имя'] || 'Гость';
      nicks[nick] = (nicks[nick] || 0) + 1;
    });

    return {
      processedLeads: allLeads,
      filteredStats: {
        visits: fSessions.length,
        paid: fLeads.filter(l => l.isPaid).length,
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 6)
      }
    };
  }, [leads, sessions, period]);

  const list = processedLeads.filter(l => 
    activeTab === 'active' ? (!l.isFailed || l.isPaid) : (l.isFailed && !l.isPaid)
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white pb-24 font-light text-slate-500">
      {/* Шапка без лишних лого */}
      <div className="p-8 flex justify-between items-center">
        <h1 className="text-[10px] tracking-[0.2em] uppercase font-medium text-slate-400">Панель управления</h1>
        <button onClick={() => fetchData()} className="text-slate-300 hover:text-indigo-400">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Фильтр периодов */}
      <div className="flex justify-center gap-6 mb-10 text-[9px] uppercase tracking-[0.15em] font-medium">
        {(['today', '7days', 'month', 'all'] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`${period === p ? 'text-indigo-500 border-b border-indigo-500' : 'text-slate-300'} pb-1 transition-all`}>
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Все'}
          </button>
        ))}
      </div>

      {/* Основная статистика */}
      <div className="grid grid-cols-2 gap-12 px-10 mb-14">
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-slate-300">Визиты</p>
          <p className="text-4xl font-extralight text-slate-800">{filteredStats.visits}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-slate-300">Оплаты</p>
          <p className="text-4xl font-extralight text-emerald-400">{filteredStats.paid}</p>
        </div>
      </div>

      {/* Активность */}
      <div className="px-10 mb-14">
        <p className="text-[9px] uppercase tracking-[0.2em] text-slate-300 mb-6 border-b border-slate-50 pb-2">Активность</p>
        <div className="space-y-4">
          {filteredStats.nicks.map(([name, count]) => (
            <div key={name} className="flex justify-between items-center">
              <span className="text-[11px] font-normal text-slate-400">{name}</span>
              <span className="text-[10px] text-slate-300">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Список транзакций */}
      <div className="px-10 space-y-8">
        <div className="flex justify-between items-end border-b border-slate-50 pb-2">
          <h3 className="text-[9px] uppercase tracking-[0.2em] text-slate-300">Заказы</h3>
          <div className="flex gap-4 text-[9px] font-medium uppercase tracking-wider">
            <button onClick={() => setActiveTab('active')} className={activeTab === 'active' ? 'text-indigo-500' : 'text-slate-300'}>Актив</button>
            <button onClick={() => setActiveTab('archive')} className={activeTab === 'archive' ? 'text-rose-400' : 'text-slate-300'}>Архив</button>
          </div>
        </div>

        {list.map((l, i) => (
          <div key={i} className="group relative">
            <div className="flex justify-between items-start mb-1">
              <h4 className="text-[12px] font-normal text-slate-600 max-w-[180px] leading-tight">{l.title}</h4>
              <span className="text-[12px] font-normal text-slate-800 whitespace-nowrap">{l.price} ₽</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-indigo-300">{l.user}</span>
              <span className="text-[9px] text-slate-200">{l.dateStr}</span>
            </div>
            <div className={`absolute -left-4 top-1 w-1 h-1 rounded-full ${l.isPaid ? 'bg-emerald-300' : 'bg-amber-200'}`} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
