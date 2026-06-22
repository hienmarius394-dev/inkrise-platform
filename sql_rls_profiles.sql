-- RLS policies for the profiles table
-- Run this SQL in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Allow users to delete their own profile
CREATE POLICY "Users can delete their own profile"
ON profiles FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Allow public read access to profiles
CREATE POLICY "Profiles are publicly readable"
ON profiles FOR SELECT
TO anon, authenticated
USING (true);