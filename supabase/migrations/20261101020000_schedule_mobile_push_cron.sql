select cron.schedule(
  'foldbook-mobile-push-minute',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://foldbook-beta.vercel.app/api/study-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'foldbook_push_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 8000
    );
  $$
);
