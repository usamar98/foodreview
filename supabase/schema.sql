-- Run once in a new foodreview Supabase project. GitHub identity is verified
-- by the app; browser roles cannot read private tables or execute these RPCs.
begin;

create table public.restaurants (
  id text primary key,
  creator text not null,
  name text not null,
  cuisine text not null,
  city text not null,
  neighborhood text not null,
  address text not null,
  price double precision not null check (price between 1 and 500),
  listed integer not null default 0 check (listed in (0,1)),
  created_at timestamptz not null default now()
);
create table public.profiles (
  user_id text primary key,
  cuisine text not null,
  budget integer not null check (budget between 5 and 250),
  priority text not null check (priority in ('food','service','value'))
);
-- Sample venues deliberately have no real restaurant rows. Do not add a
-- restaurant foreign key that would prevent saving or reviewing a sample.
create table public.saved (
  user_id text not null,
  restaurant_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id,restaurant_id)
);
create table public.reviews (
  id text primary key,
  user_id text not null,
  restaurant_id text not null,
  visit_date date not null,
  dish text not null,
  spend double precision not null check (spend > 0 and spend <= 10000),
  return_visit integer not null check (return_visit in (0,1)),
  food integer not null check (food between 1 and 5),
  service integer not null check (service between 1 and 5),
  value integer not null check (value between 1 and 5),
  note text not null,
  incentivized integer not null check (incentivized in (0,1)),
  relationship integer not null check (relationship in (0,1)),
  receipt_key text not null,
  receipt_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  decision_note text,
  moderator text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id,restaurant_id,visit_date),
  check ((status = 'pending' and decision_note is null and moderator is null and decided_at is null)
    or (status <> 'pending' and decision_note is not null and moderator is not null and decided_at is not null))
);
create index restaurants_creator_idx on public.restaurants(creator);
create index restaurants_identity_idx on public.restaurants(lower(name),lower(address));
create index reviews_restaurant_status_visit_idx on public.reviews(restaurant_id,status,visit_date);
create index reviews_user_created_idx on public.reviews(user_id,created_at desc);
create index reviews_pending_created_idx on public.reviews(created_at) where status = 'pending';

alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.saved enable row level security;
alter table public.reviews enable row level security;
-- No anon/authenticated policies: all access goes through authorized app routes.
revoke all on public.restaurants,public.profiles,public.saved,public.reviews from public,anon,authenticated;
grant select,insert,update,delete on public.restaurants,public.profiles,public.saved,public.reviews to service_role;

create function public.savour_restaurants(p_user_id text)
returns table (id text,name text,cuisine text,city text,neighborhood text,address text,price double precision,listed integer,created_at timestamptz,yes bigint,count bigint,food double precision,service double precision,value double precision,"lastVisit" date,excluded bigint)
language sql stable security invoker set search_path = '' as $$
  select r.id,r.name,r.cuisine,r.city,r.neighborhood,r.address,r.price,r.listed,r.created_at,
    coalesce(a.yes,0),coalesce(a.count,0),coalesce(a.food,0),coalesce(a.service,0),coalesce(a.value,0),a.last_visit,coalesce(x.excluded,0)
  from public.restaurants r
  left join (
    select restaurant_id,sum(return_visit) as yes,count(*) as count,
      avg(food)::double precision as food,avg(service)::double precision as service,avg(value)::double precision as value,max(visit_date) as last_visit
    from public.reviews
    where status = 'verified' and incentivized = 0 and relationship = 0
      and visit_date >= (now() at time zone 'UTC')::date - 180
    group by restaurant_id
  ) a on a.restaurant_id = r.id
  left join (
    select restaurant_id,count(*) as excluded from public.reviews
    where status = 'verified' and (incentivized = 1 or relationship = 1)
    group by restaurant_id
  ) x on x.restaurant_id = r.id
  where r.listed = 1 or r.creator = p_user_id
  order by r.created_at desc;
$$;

create function public.savour_find_restaurant(p_name text,p_address text,p_user_id text)
returns table (id text)
language sql stable security invoker set search_path = '' as $$
  select r.id from public.restaurants r
  where lower(r.name) = lower(p_name) and lower(r.address) = lower(p_address)
    and (r.listed = 1 or r.creator = p_user_id)
  order by r.created_at limit 1;
$$;

create function public.savour_moderate_review(p_id text,p_decision text,p_reason text,p_moderator text)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  venue_id text;
begin
  if p_decision not in ('verified','rejected') or p_decision is null
    or p_reason is null or length(trim(p_reason)) not between 10 and 500
    or p_moderator is null or length(p_moderator) = 0 then
    raise exception 'Invalid moderation decision' using errcode = '22023';
  end if;
  -- The update obtains a row lock; concurrent/repeated decisions cannot win twice.
  update public.reviews set status = p_decision,decision_note = trim(p_reason),moderator = p_moderator,decided_at = now()
    where id = p_id and status = 'pending' returning restaurant_id into venue_id;
  if not found then return false; end if;
  if p_decision = 'verified' then
    update public.restaurants set listed = 1 where id = venue_id;
  end if;
  return true;
end;
$$;

revoke all on function public.savour_restaurants(text),public.savour_find_restaurant(text,text,text),public.savour_moderate_review(text,text,text,text) from public,anon,authenticated;
grant execute on function public.savour_restaurants(text),public.savour_find_restaurant(text,text,text),public.savour_moderate_review(text,text,text,text) to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('receipts','receipts',false,4194304,array['image/jpeg','image/png','application/pdf']);
-- No public storage policies or public URLs. App routes authorize receipt access.
notify pgrst,'reload schema';
commit;
