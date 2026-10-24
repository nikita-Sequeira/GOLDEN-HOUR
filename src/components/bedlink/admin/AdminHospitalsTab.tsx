import React from 'react';
import { Hospital } from '../../../types/bedlink';
import { Translations } from '../../../i18n/translations';
import { Clock, Building2, MapPin, Phone, ShieldCheck } from 'lucide-react';

interface AdminHospitalsTabProps {
  hospitals: Hospital[];
  t: Translations;
}

export const AdminHospitalsTab: React.FC<AdminHospitalsTabProps> = ({ hospitals }) => {
  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-500 font-semibold">
        Managing <strong className="text-slate-900">{hospitals.length}</strong> facilities across all 10 zones of the Western Railway corridor.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hospitals.map((hosp) => (
          <div key={hosp.id} className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="relative h-32 w-full overflow-hidden bg-slate-900">
              <img
                src={hosp.imageUrl || `/assets/hospitals/${hosp.id}.jpg`}
                alt={hosp.name}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=500&q=80';
                }}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent pointer-events-none" />
              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                {hosp.isGovernment ? (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-600 text-white shadow-xs">
                    Govt
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-600 text-white shadow-xs">
                    Private
                  </span>
                )}
                {hosp.isRecommended && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-slate-950 shadow-xs">
                    Recommended
                  </span>
                )}
              </div>
              <div className="absolute bottom-2.5 left-3 right-3 text-white">
                <h4 className="font-extrabold text-sm text-white leading-tight drop-shadow-sm truncate">
                  {hosp.name}
                </h4>
              </div>
            </div>

            <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{hosp.zone} • {hosp.stationVicinity}</span>
                </p>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-mono text-slate-700 text-[11px] flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{hosp.phone}</span>
                </span>
                {hosp.acceptsInsurance ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Cashless PM-JAY</span>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Cash Billing
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 pt-0 space-y-3">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center text-xs">
                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-900 font-semibold">
                  <div className="text-[9px] font-bold text-purple-700">ICU</div>
                  <strong>{hosp.beds.icu}</strong>
                </div>
                <div className="p-1.5 rounded-lg bg-rose-50 text-rose-900 font-semibold">
                  <div className="text-[9px] font-bold text-rose-700">Trauma</div>
                  <strong>{hosp.beds.trauma}</strong>
                </div>
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-900 font-semibold">
                  <div className="text-[9px] font-bold text-blue-700">Vent</div>
                  <strong>{hosp.beds.vent}</strong>
                </div>
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-900 font-semibold">
                  <div className="text-[9px] font-bold text-emerald-700">O2</div>
                  <strong>{hosp.beds.oxygen}</strong>
                </div>
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-900 font-semibold">
                  <div className="text-[9px] font-bold text-amber-700">Burns</div>
                  <strong>{hosp.beds.burns}</strong>
                </div>
                <div className="p-1.5 rounded-lg bg-slate-100 text-slate-900 font-semibold">
                  <div className="text-[9px] font-bold text-slate-700">General</div>
                  <strong>{hosp.beds.general}</strong>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Updated {hosp.freshMinutesAgo}m ago</span>
                </span>
                <span className="font-mono text-slate-500">ID: {hosp.id}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
