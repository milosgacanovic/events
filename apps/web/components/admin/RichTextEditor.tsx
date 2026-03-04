"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useRef } from "react";

// Stable extension array — created once at module level so TipTap v3's
// reactive useEditor never sees a reference change and never recreates.
const extensions = [StarterKit, Underline];

type ToolbarButtonProps = {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, active, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={active ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// Uncontrolled editor: `value` is only used as initial content on mount.
// To reset the editor for a different entity, change the `key` prop on the
// parent so React remounts this component with fresh state.
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  // Refs keep the useEditor options stable across re-renders, preventing
  // TipTap v3's reactive option diffing from calling setOptions/updateState.
  const initialContent = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions,
    content: initialContent.current,
    // Required for Next.js SSR — prevents hydration mismatch that can
    // corrupt internal ProseMirror state (including stored marks).
    immediatelyRender: false,
    onUpdate({ editor: ed }) {
      onChangeRef.current(ed.getHTML());
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="rich-editor">
      <div className="rich-editor-toolbar">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          ≡
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          "
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
