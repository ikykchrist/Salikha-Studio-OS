alter table public.invoice_settings
  add column if not exists payment_qr_data_url text;
