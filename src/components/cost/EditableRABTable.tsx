import { useState } from 'react';
import { BudgetComponent } from '@/types/cost.types';
import { Input } from '@/components/ui/input';
import { Save, Edit2 } from 'lucide-react';

interface EditableRABTableProps {
  data: BudgetComponent[];
  onDataChange: (newData: BudgetComponent[]) => void;
}

export default function EditableRABTable({ data, onDataChange }: EditableRABTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localData, setLocalData] = useState<BudgetComponent[]>(data);

  // Group data by groupName
  const groupedData = localData.reduce((acc, item) => {
    const group = item.groupName || 'Lainnya';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, BudgetComponent[]>);

  const handleEditChange = (id: string, field: keyof BudgetComponent, value: number) => {
    setLocalData(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Recalculate Unit Price and Total
        if (field === 'unitLaborCost' || field === 'unitMaterialCost') {
          updated.unitPrice = (updated.unitLaborCost || 0) + (updated.unitMaterialCost || 0);
        }
        if (field === 'plannedVolume' || field === 'unitLaborCost' || field === 'unitMaterialCost' || field === 'unitPrice') {
          updated.totalPlannedCost = updated.plannedVolume * updated.unitPrice;
        }
        return updated;
      }
      return item;
    }));
  };

  const handleSave = () => {
    setEditingId(null);
    onDataChange(localData);
  };

  return (
    <div className="w-full">
      {Object.entries(groupedData).map(([groupName, items]) => {
        const groupSubTotal = items.reduce((sum, item) => sum + item.totalPlannedCost, 0);

        return (
          <div key={groupName} className="mb-8 border border-border rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-muted px-4 py-3 flex justify-between items-center border-b border-border">
              <h3 className="font-semibold text-foreground uppercase tracking-wider text-sm">{groupName}</h3>
              <p className="font-bold text-navy">Rp {groupSubTotal.toLocaleString('id-ID')}</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#fcfcfc] text-muted-foreground font-medium text-xs">
                  <tr>
                    <th className="px-4 py-3 w-64">Nama Pekerjaan</th>
                    <th className="px-4 py-3 text-right w-24">Vol</th>
                    <th className="px-4 py-3 w-16">Sat</th>
                    <th className="px-4 py-3 text-right">H. Upah</th>
                    <th className="px-4 py-3 text-right">H. Material</th>
                    <th className="px-4 py-3 text-right">H. Satuan</th>
                    <th className="px-4 py-3 text-right font-bold w-40">Total</th>
                    <th className="px-4 py-3 text-center w-16">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => {
                    const isEditing = editingId === item.id;

                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                        
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <Input 
                              type="number" 
                              className="w-20 text-right h-8"
                              value={item.plannedVolume} 
                              onChange={(e) => handleEditChange(item.id, 'plannedVolume', Number(e.target.value))}
                            />
                          ) : (
                            item.plannedVolume.toLocaleString('id-ID')
                          )}
                        </td>
                        
                        <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>

                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <Input 
                              type="number" 
                              className="w-28 text-right h-8"
                              value={item.unitLaborCost || 0} 
                              onChange={(e) => handleEditChange(item.id, 'unitLaborCost', Number(e.target.value))}
                            />
                          ) : (
                            `Rp ${(item.unitLaborCost || 0).toLocaleString('id-ID')}`
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <Input 
                              type="number" 
                              className="w-28 text-right h-8"
                              value={item.unitMaterialCost || 0} 
                              onChange={(e) => handleEditChange(item.id, 'unitMaterialCost', Number(e.target.value))}
                            />
                          ) : (
                            `Rp ${(item.unitMaterialCost || 0).toLocaleString('id-ID')}`
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-medium">
                           Rp {item.unitPrice.toLocaleString('id-ID')}
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-navy bg-slate-50">
                          Rp {item.totalPlannedCost.toLocaleString('id-ID')}
                        </td>

                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700 p-1">
                               <Save className="h-4 w-4" />
                            </button>
                          ) : (
                            <button onClick={() => setEditingId(item.id)} className="text-muted-foreground hover:text-foreground p-1">
                               <Edit2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
