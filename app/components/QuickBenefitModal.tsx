import React, { useState, useEffect, useRef } from 'react';
import { X, Edit3 } from 'lucide-react';
import BenefitsModal from './BenefitsModal';
import DOMPurify from 'dompurify';
import { useTemplates, Template } from './TemplateManager';

interface QuickBenefitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (payload: { selectedTemplateId: string; templateName: string; content: TemplateSections; resolvedBenefit: {district: string; taluka: string; category: 'I'|'II'|'III'} | null }) => void;
}

type TemplateSections = {
  overview: string;
};

// ContentEditable Editor Component
interface ContentEditableEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder: string;
}

const ContentEditableEditor: React.FC<ContentEditableEditorProps> = ({ content, onChange, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!content || content.trim() === '');
  const [isFocused, setIsFocused] = useState(false);

  // Only sync external content when not focused to avoid caret jumps
  useEffect(() => {
    if (!editorRef.current) return;
    if (isFocused) return;
    if (editorRef.current.innerHTML !== (content || '')) {
      editorRef.current.innerHTML = content || '';
      setIsEmpty(!content || content.trim() === '');
    }
  }, [content, isFocused]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = (e.currentTarget as HTMLDivElement).innerHTML;
    onChange(html);
    setIsEmpty(!html || html.trim() === '' || html === '<br>');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html);
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (isEmpty && editorRef.current) {
      editorRef.current.innerHTML = '';
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setIsEmpty(!html || html.trim() === '' || html === '<br>');
    }
  };

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        className="w-full min-h-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black whitespace-pre-wrap resize-y overflow-auto text-left force-ltr"
        dir="ltr"
        style={{ direction: 'ltr', unicodeBidi: 'plaintext', textAlign: 'left' }}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        suppressContentEditableWarning
      />
      {isEmpty && (
        <div className="absolute top-2 left-3 text-gray-500 text-sm pointer-events-none select-none">
          {placeholder}
        </div>
      )}
    </div>
  );
};

const QuickBenefitModal: React.FC<QuickBenefitModalProps> = ({ isOpen, onClose, onSave }) => {
  const { templates, activeTemplateId, setActiveTemplateId, createTemplate, deleteTemplate, renameTemplate, updateTemplateContent, getTemplateById } = useTemplates();
  const [showBenefitsModal, setShowBenefitsModal] = useState(false);
  const [resolvedBenefit, setResolvedBenefit] = useState<{district: string; taluka: string; category: 'I'|'II'|'III'} | null>(null);
  const [showContentEditor, setShowContentEditor] = useState(false);
  const [editingContent, setEditingContent] = useState<TemplateSections>({
    overview: ''
  });
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [renamingTemplateId, setRenamingTemplateId] = useState<string | null>(null);

  // ESC key handler to close only QuickBenefitModal
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // ESC key handler for Content Editor Modal
  useEffect(() => {
    if (!showContentEditor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowContentEditor(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showContentEditor]);

  const handleEditContent = () => {
    const currentTemplate = getTemplateById(activeTemplateId || '');
    setEditingContent(currentTemplate?.content || { overview: '' });
    setShowContentEditor(true);
  };

  const handleCreateTemplate = () => {
    if (!newTemplateName.trim()) return;
    const templateId = createTemplate(newTemplateName);
    if (templateId) {
      setActiveTemplateId(templateId);
      setNewTemplateName('');
      setShowTemplateManager(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!activeTemplateId) return;
    await deleteTemplate(activeTemplateId);
  };

  const handleRenameTemplate = () => {
    if (!renamingTemplateId || !newTemplateName.trim()) return;
    const success = renameTemplate(renamingTemplateId, newTemplateName);
    if (success) {
      setRenamingTemplateId(null);
      setNewTemplateName('');
    }
  };

  const handleSaveTemplateContent = () => {
    if (!activeTemplateId) return;
    const sanitizedContent = { overview: DOMPurify.sanitize(editingContent.overview) };
    updateTemplateContent(activeTemplateId, sanitizedContent);
    setShowContentEditor(false);
  };

  if (!isOpen) return null;

  // Cache active template instance to reduce repeated lookups
  const activeTemplate = getTemplateById(activeTemplateId || '');

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Quick Benefit Template</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEditContent}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Edit Content"
            >
              <Edit3 className="h-6 w-6" />
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close modal"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Template sections */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Template Content - {activeTemplate?.name || 'No Template Selected'}</h3>
              
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm ring-1 ring-gray-100 w-full text-left" dir="ltr">
                <h4 className="font-medium text-gray-800 mb-2 text-left" dir="ltr">Benefits Overview</h4>
                <div
                  className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap text-left"
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(activeTemplate?.content.overview || '') || 'This section will contain benefits overview...' 
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 gap-4">
          {/* Template Management */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Template Selection Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={activeTemplateId || ''}
                onChange={(e) => setActiveTemplateId(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black"
                aria-label="Select template"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Template Management Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowTemplateManager(true)}
                className="px-2 py-1.5 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
                title="Create new template"
              >
                + New
              </button>
              <button
                onClick={() => setRenamingTemplateId(activeTemplateId)}
                disabled={!activeTemplateId}
                className="px-2 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Rename template"
              >
                Rename
              </button>
              <button
                onClick={handleDeleteTemplate}
                disabled={!activeTemplateId || templates.length <= 1}
                className="px-2 py-1.5 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete template"
              >
                Delete
              </button>
            </div>

            {/* Template Creation/Rename UI */}
            {(showTemplateManager || renamingTemplateId) && (
              <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-md">
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder={renamingTemplateId ? "New template name" : "Template name"}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-black placeholder-black"
                  autoFocus
                />
                <button
                  onClick={renamingTemplateId ? handleRenameTemplate : handleCreateTemplate}
                  className="px-2 py-1 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowTemplateManager(false);
                    setRenamingTemplateId(null);
                    setNewTemplateName('');
                  }}
                  className="px-2 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Benefits button */}
          <div className="flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowBenefitsModal(true)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              title="Open Benefits selector"
            >
              Benefits
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                onSave?.({
                  selectedTemplateId: activeTemplateId || '',
                  templateName: activeTemplate?.name || '',
                  content: activeTemplate?.content || { overview: '' },
                  resolvedBenefit
                });
                onClose();
              }}
              disabled={!activeTemplateId || templates.length === 0}
              {...((!activeTemplateId || templates.length === 0) && { 'aria-disabled': 'true' })}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Template
            </button>
          </div>
        </div>
      </div>

      {/* Benefits Modal */}
      <BenefitsModal
        isOpen={showBenefitsModal}
        onClose={() => setShowBenefitsModal(false)}
        onCategoryResolved={(district, taluka, category) => {
          setResolvedBenefit({ district, taluka, category });
          setShowBenefitsModal(false);
        }}
      />

      {/* Content Editor Modal */}
      {showContentEditor && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
          onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Edit Template Content - {activeTemplate?.name || 'Template'}
              </h2>
              <button
                onClick={() => setShowContentEditor(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Close editor"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Editor Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                {/* Benefits Overview Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Benefits Overview
                  </label>
                  <ContentEditableEditor
                    content={editingContent.overview}
                    onChange={(html) => setEditingContent(prev => ({ ...prev, overview: html }))}
                    placeholder="Enter benefits overview content... Bold text, formatting, spaces, and line breaks will be preserved exactly as typed or pasted."
                  />
                </div>
              </div>
            </div>

            {/* Editor Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowContentEditor(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplateContent}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Save Content
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickBenefitModal;
