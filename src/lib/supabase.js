import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yjimxoqzduefvegrvxdi.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqaW14b3F6ZHVlZnZlZ3J2eGRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNDM0ODcsImV4cCI6MjEwMjcxOTQ4N30.bOP9SrQnriANMmLgwKJ_TFF-qo_st3vKrNphifUsaF8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
