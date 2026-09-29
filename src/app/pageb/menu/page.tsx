"use client";

import { useEffect, useState } from "react";
import Grid from "../grid/page";
import Delegation from "../delegation/page";
import Banner from "../(component)/banner/welcome-banner";
import { createClient } from "../../supabase/client";

export default function Page() {
  const [name, setName] = useState("there");
  const [position, setPosition] = useState("Correspondence Officer");

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from("profilec")
        .select("full_name, position")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled && data) {
        if (data.full_name?.trim()) setName(data.full_name.trim());
        if (data.position?.trim()) setPosition(data.position.trim());
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Banner name={name} role={position} agendaHref="/calendar" />
      <Grid />
      <Delegation />
    </>
  );
}
