"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import { useEffect, useRef } from "react";

// Override marks so they do NOT bleed into adjacent typing.
// ProseMirror's default inclusive:true causes marks to extend
// when the cursor is at the boundary of a styled element.
const NonInclusiveBold = Bold.extend({ inclusive: false });
const NonInclusiveItalic = Italic.extend({ inclusive: false });
const NonInclusiveUnderline = Underline.extend({ inclusive: false });

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

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  // Track the last HTML the editor itself produced so we can distinguish
  // internal edits (no setContent needed) from external value changes
  // (e.g. switching to a different entity), where we DO need setContent.
  const lastEmittedRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ bold: false, italic: false }),
      NonInclusiveBold,
      NonInclusiveItalic,
      NonInclusiveUnderline,
    ],
    content: value,
    onUpdate({ editor: ed }) {
      const html = ed.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  // Only replace content when the value changed externally (not from the
  // editor's own onUpdate). Calling setContent resets the cursor, so doing
  // it on every keystroke would jump the cursor and break editing.
  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

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
