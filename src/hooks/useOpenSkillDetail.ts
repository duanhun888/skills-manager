import { useCallback } from "react";
import { useApp } from "../context/AppContext";

/** Open the global skill detail overlay without changing the current route. */
export function useOpenSkillDetail() {
  const { openSkillDetailById } = useApp();

  return useCallback(
    (skillId: string) => {
      openSkillDetailById(skillId);
    },
    [openSkillDetailById]
  );
}
