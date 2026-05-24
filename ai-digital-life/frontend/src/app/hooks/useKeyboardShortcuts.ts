import { useEffect } from "react";
import { useAppActions } from "./useAppActions";

export function useKeyboardShortcuts(
  setNewSessionDialogOpen: (open: boolean) => void,
  setCreateWorkspaceModalOpen: (open: boolean) => void,
) {
  const actions = useAppActions();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setNewSessionDialogOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setCreateWorkspaceModalOpen(true);
      } else if ((event.ctrlKey || event.metaKey) && (event.key === "o" || event.key === "O")) {
        event.preventDefault();
        void actions.pickWorkspaceDirectory().then((picked) => {
          if (picked) void actions.openWorkspace(picked);
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setNewSessionDialogOpen, setCreateWorkspaceModalOpen, actions.openWorkspace, actions.pickWorkspaceDirectory]);
}
