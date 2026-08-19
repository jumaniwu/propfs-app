-- ============================================================
-- PropFS — PO boleh memakai satuan dagang, panel lapangan tetap benar
--
-- Lapangan meminta 49 Batang kayu. Pembelian dilakukan 2 Ton. Keduanya benar,
-- dan sampai sekarang keduanya dipaksa menjadi satu angka.
--
-- `po_tandai_terkirim` mengurangi permintaan dengan `items[].qty` — angka yang
-- ditulis untuk VENDOR. Ketika satuannya berbeda, yang terjadi adalah 49
-- dikurangi 2, dan panel "Menunggu Dipesan" berbunyi "sisa 47 Batang"
-- selamanya. Tidak ada yang gagal, tidak ada galat, tidak ada pesan: barangnya
-- sudah datang, dan sistemnya masih menyuruh memesan lagi.
--
-- Karena itu baris PO kini boleh membawa `penuhi`: berapa banyak permintaan
-- yang ditutup baris ini, DALAM SATUAN PERMINTAAN. Fungsi di bawah memakainya
-- bila ada.
--
-- SELURUH PO LAMA TETAP BENAR. Tidak satu pun dari mereka punya `penuhi`, dan
-- ketiadaannya berarti "pakai qty" — persis perilaku sebelum berkas ini ada.
-- Itu sebabnya medannya tidak ditulis ketika satuannya sama: satu angka, satu
-- sumber kebenaran, dan tidak ada tempat kedua yang bisa berselisih dengannya.
--
-- Aman dijalankan berulang.
-- ============================================================

create or replace function public.po_tandai_terkirim(p_po_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  po record;
  it jsonb;
  v_kurang numeric;
begin
  select * into po from purchase_orders
   where id = p_po_id
     and (user_id = auth.uid() or public.is_team_member(user_id));
  if po is null then return false; end if;

  -- Wajib sudah ditandatangani pembuat DAN disetujui.
  if po.pembuat_signature is null or po.approver_signature is null then
    return false;
  end if;
  if po.status = 'terkirim' or po.status = 'selesai' then return true; end if;

  for it in select * from jsonb_array_elements(po.items) loop
    if (it ->> 'request_id') is not null and (it ->> 'request_id') <> '' then

      -- Inilah satu-satunya perubahan yang berarti di berkas ini.
      --
      -- `penuhi` dipakai bila ada; kalau tidak, `qty` seperti dulu. Ditulis
      -- sebagai satu ungkapan yang dihitung SEKALI, bukan diulang di klausa
      -- set dan klausa case — versi lama mengulang `(it ->> 'qty')::numeric`
      -- di dua tempat, dan dua salinan rumus yang sama adalah dua tempat yang
      -- bisa berselisih ketika salah satunya diperbaiki.
      v_kurang := coalesce(
        nullif((it ->> 'penuhi'), '')::numeric,
        (it ->> 'qty')::numeric,
        0
      );

      update material_requests
         set qty_dipesan = least(qty, coalesce(qty_dipesan, 0) + v_kurang),
             status = case
               when coalesce(qty_dipesan, 0) + v_kurang >= qty
                 then 'dibeli' else status end
       where id = (it ->> 'request_id')::uuid
         and (user_id = auth.uid() or public.is_team_member(user_id));
    end if;
  end loop;

  update purchase_orders
     set status = 'terkirim', terkirim_at = now()
   where id = p_po_id;

  return true;
end $$;

revoke all on function public.po_tandai_terkirim(uuid) from public;
grant execute on function public.po_tandai_terkirim(uuid) to authenticated;
