import React, { useMemo, useState, useEffect } from 'react';
import { RefreshCw, Activity, Users, CreditCard } from 'lucide-react';

const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwXmgT1Xxfl1J4Cfv8crVMFeJkhQbT7AfVOYpYfM8cMXKEVLP6-nh4z8yrTRiBrvgW1/exec';

const AdminDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [period, setPeriod] = useState<'today' | '7days' | 'month' | 'all'>('all');

  // Четкий парсер для твоего формата даты "22.01.2026, 13:20"
  const parseDate = (val: any) => {
    if (!val) return 0;
    const s = String(val);
    // Если пришло число (таймстамп)
    if (!isNaN(Number(s)) && s.length > 10) return Number(s);
    // Если пришла строка 22.01.2026
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
      // Берем данные напрямую из Sessions и Leads
      setSessions(data.sessions || []);
      setLeads(data.leads || []);
    } catch (e) { console.error("Ошибка"); }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const inv = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(inv);
  }, []);

  const { filteredStats, processedLeads } = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const now = Date.now();

    // Обработка заказов (Leads)
    const allLeads = (leads || []).map(l => {
      const ts = parseDate(l.timestamp || l['Дата']);
      const status = String(l.PaymentStatus || l['Статус'] || '').toLowerCase();
      return {
        ...l, ts,
        isPaid: status === 'да' || status.includes('оплат'),
        isFailed: status === 'нет' || status.includes('отмена') || status.includes('архив'),
        title: l.productTitle || l['Товар'] || 'Заказ',
        price: l.price || l['Сумма'] || '0',
        user: l.customerEmail || l['Email'] || 'Гость',
        dateStr: ts > 0 ? new Date(ts).toLocaleDateString('ru-RU') : '---'
      };
    });

    let limit = 0;
    if (period === 'today') limit = todayStart;
    else if (period === '7days') limit = now - 7 * 86400000;
    else if (period === 'month') limit = now - 30 * 86400000;

    const fLeads = allLeads.filter(l => period === 'all' || l.ts >= limit);
    // СТАТИСТИКА ВИЗИТОВ: ищем строго по колонке "Дата"
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
        nicks: Object.entries(nicks).sort((a, b) => b[1] - a[1]).slice(0, 5)
      }
    };
  }, [leads, sessions, period]);

  const list = processedLeads.filter(l => 
    activeTab === 'active' ? (!l.isFailed || l.isPaid) : (l.isFailed && !l.isPaid)
  );

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white pb-20 text-slate-700 font-sans">
      {/* Header */}
      <div className="p-6 flex justify-between items-center border-b border-slate-50">
        <h1 className="text-xs font-bold uppercase tracking-widest text-slate-400">Статистика</h1>
        <button onClick={() => fetchData()} className="p-2 text-slate-400">
          <RefreshCw size={20} className={loading ? 'animate-spin text-indigo-500' : ''} />
        </button>
      </div>

      {/* Фильтр */}
      <div className="flex justify-around bg-slate-50/50 py-4 border-b border-slate-50">
        {(['today', '7days', 'month', 'all'] as const).map((p) => (
          <button 
            key={p} 
            onClick={() => setPeriod(p)}
            className={`text-[11px] font-bold uppercase tracking-wider ${period === p ? 'text-indigo-600' : 'text-slate-300'}`}
          >
            {p === 'today' ? 'День' : p === '7days' ? '7 Дн' : p === 'month' ? 'Мес' : 'Все'}
          </button>
        ))}
      </div>

      {/* Цифры */}
      <div className="grid grid-cols-2 gap-px bg-slate-100 border-b border-slate-100">
        <div className="bg-white p-8 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Визиты</p>
          <p className="text-4xl font-bold text-slate-800 tracking-tighter">{filteredStats.visits}</p>
        </div>
        <div className="bg-white p-8 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Оплаты</p>
          <p className="text-4xl font-bold text-emerald-500 tracking-tighter">{filteredStats.paid}</p>
        </div>
      </div>

      {/* Активность */}
      <div className="p-6 border-b border-slate-50">
        <div className="flex items-center gap-2 mb-6 text-slate-400">
          <Activity size={16} />
          <h2 className="text-[11px] font-bold uppercase tracking-widest">Активность (Email)</h2>
        </div>
        <div className="space-y-4">
          {filteredStats.nicks.map(([name, count]) => (
            <div key={name} className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-slate-600 truncate max-w-[200px]">{name}</span>
              <span className="text-[11px] font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Список */}
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Транзакции</h3>
          <div className="flex gap-4">
            <button onClick={() => setActiveTab('active')} className={`text-[10px] font-bold uppercase ${activeTab === 'active' ? 'text-indigo-600' : 'text-slate-300'}`}>Актив</button>
            <button onClick={() => setActiveTab('archive')} className={`text-[10px] font-bold uppercase ${activeTab === 'archive' ? 'text-rose-500' : 'text-slate-300'}`}>Архив</button>
          </div>
        </div>

        {list.map((l, i) => (
          <div key={i} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-50">
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-[14px] font-bold text-slate-700 leading-tight">{l.title}</h4>
              <span className="text-[14px] font-bold text-slate-900">{l.price} ₽</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-indigo-400">{l.user}</span>
              <span className="text-[10px] font-bold text-slate-300">{l.dateStr}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
