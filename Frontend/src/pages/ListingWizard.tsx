import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ChevronRight, ChevronLeft, Plus, AlertCircle } from 'lucide-react';

export const ListingWizard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    isbn: '9780132350884',
    title: '',
    author: '',
    publisher: '',
    edition: '1st Edition',
    category: 'Engineering',
    description: '',

    condition: 'EXCELLENT',
    coverCondition: 'Clean',
    pagesCondition: 'Crisp white pages',
    bindingCondition: 'Firm',
    writingPresent: false,
    highlightingPresent: false,
    damageNotes: '',

    images: [
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    ],

    askingPrice: 450,
    minimumOfferPrice: 350,
  });

  const categories = [
    'Engineering',
    'Programming',
    'Competitive Exams',
    'School',
    'College',
    'Novels',
    'Fiction',
    'Non-Fiction',
    'Business',
    'Self Help',
  ];

  const handleNext = () => {
    if (step === 1 && (!formData.title || !formData.author || !formData.isbn)) {
      setError('Please fill in ISBN, Title, and Author.');
      return;
    }
    setError('');
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setError('');
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        isbn: formData.isbn,
        title: formData.title,
        author: formData.author,
        publisher: formData.publisher,
        edition: formData.edition,
        category: formData.category,
        description: formData.description,
        askingPrice: Number(formData.askingPrice),
        minimumOfferPrice: formData.minimumOfferPrice ? Number(formData.minimumOfferPrice) : undefined,
        condition: formData.condition,
        conditionDetails: {
          coverCondition: formData.coverCondition,
          pagesCondition: formData.pagesCondition,
          bindingCondition: formData.bindingCondition,
          writingPresent: formData.writingPresent,
          highlightingPresent: formData.highlightingPresent,
          damageNotes: formData.damageNotes,
        },
        images: formData.images.map((url, idx) => ({
          url,
          isPrimary: idx === 0,
        })),
      };

      const res: any = await api.post('/books/listings', payload);
      navigate(`/books/${res.data.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to publish listing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Wizard Header */}
      <div className="text-center space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-gold">Seller Listing Engine</span>
        <h1 className="font-heading text-3xl font-extrabold text-slate-900 dark:text-ivory">
          List Your Second-Hand Book
        </h1>
        <p className="text-xs text-slate-500">5-step wizard to present your book copy to thousands of readers</p>
      </div>

      {/* Stepper Header */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800">
        {[
          { num: 1, label: 'Book Info' },
          { num: 2, label: 'Condition' },
          { num: 3, label: 'Images' },
          { num: 4, label: 'Pricing' },
          { num: 5, label: 'Publish' },
        ].map((s) => (
          <div key={s.num} className="flex items-center space-x-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step >= s.num ? 'bg-gold text-obsidian' : 'bg-slate-100 dark:bg-obsidian text-slate-400'
              }`}
            >
              {s.num}
            </div>
            <span className={`text-xs font-bold hidden sm:inline ${step === s.num ? 'text-gold' : 'text-slate-400'}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-brandError/10 border border-brandError/30 text-brandError text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step Content */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-graphite border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        {/* Step 1: Book Info */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Step 1: Book Metadata</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ISBN Barcode Number *</label>
                <input
                  type="text"
                  placeholder="e.g. 9780132350884"
                  value={formData.isbn}
                  onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Book Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Clean Code: A Handbook of Agile Software Craftsmanship"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Author Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Robert C. Martin"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Publisher & Edition</label>
                <input
                  type="text"
                  placeholder="e.g. Pearson, 3rd Edition"
                  value={formData.edition}
                  onChange={(e) => setFormData({ ...formData, edition: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Synopsis / Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe the content of the book for prospective buyers..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Condition */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Step 2: Physical Condition Matrix</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Overall Condition Rating *</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                >
                  <option value="LIKE_NEW">Like New (Unread feel)</option>
                  <option value="EXCELLENT">Excellent (Minimal shelf wear)</option>
                  <option value="GOOD">Good (Lightly read, firm binding)</option>
                  <option value="ACCEPTABLE">Acceptable (Noticeable wear / notes)</option>
                  <option value="POOR">Poor (Heavy wear, all text readable)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Cover Condition</label>
                <input
                  type="text"
                  placeholder="e.g. Crisp cover, minor crease on corner"
                  value={formData.coverCondition}
                  onChange={(e) => setFormData({ ...formData, coverCondition: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>

              <div className="flex items-center space-x-6 py-2 sm:col-span-2">
                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                  <input
                    type="checkbox"
                    checked={formData.writingPresent}
                    onChange={(e) => setFormData({ ...formData, writingPresent: e.target.checked })}
                    className="w-4 h-4 rounded text-gold focus:ring-gold"
                  />
                  <span>Pencil/Pen Writing Present</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                  <input
                    type="checkbox"
                    checked={formData.highlightingPresent}
                    onChange={(e) => setFormData({ ...formData, highlightingPresent: e.target.checked })}
                    className="w-4 h-4 rounded text-gold focus:ring-gold"
                  />
                  <span>Text Highlighting Present</span>
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Damage / Wear Disclosures</label>
                <textarea
                  rows={2}
                  placeholder="Be honest about any torn pages, highlighting, or spine wear to build buyer trust..."
                  value={formData.damageNotes}
                  onChange={(e) => setFormData({ ...formData, damageNotes: e.target.value })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Images */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Step 3: Book Photos</h3>
            <p className="text-xs text-slate-500">Provide direct image URLs showing front cover, spine, inside pages, and damage if any.</p>
            <div className="space-y-3">
              {formData.images.map((img, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={img}
                    onChange={(e) => {
                      const updated = [...formData.images];
                      updated[idx] = e.target.value;
                      setFormData({ ...formData, images: updated });
                    }}
                    className="flex-1 px-4 py-2 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory focus:outline-none focus:border-gold"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, images: [...formData.images, 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=600&q=80'] })}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gold/10 text-gold border border-gold/30 hover:bg-gold hover:text-obsidian transition flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Image URL</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Pricing */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Step 4: Pricing & Minimum Offers</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Asking Price (₹) *</label>
                <input
                  type="number"
                  min={10}
                  value={formData.askingPrice}
                  onChange={(e) => setFormData({ ...formData, askingPrice: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory font-heading font-bold text-base focus:outline-none focus:border-gold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Minimum Allowed Offer Price (₹)</label>
                <input
                  type="number"
                  min={10}
                  max={formData.askingPrice}
                  value={formData.minimumOfferPrice}
                  onChange={(e) => setFormData({ ...formData, minimumOfferPrice: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-100 dark:bg-obsidian border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-ivory font-heading font-bold text-base focus:outline-none focus:border-gold"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Preview & Publish */}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-ivory">Step 5: Preview & Confirm</h3>
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-obsidian/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <p><strong>Title:</strong> {formData.title}</p>
              <p><strong>Author:</strong> {formData.author}</p>
              <p><strong>Condition:</strong> {formData.condition}</p>
              <p><strong>Asking Price:</strong> ₹{formData.askingPrice}</p>
              <p><strong>Min Offer:</strong> ₹{formData.minimumOfferPrice}</p>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          {step > 1 ? (
            <button
              onClick={handleBack}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-obsidian text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center space-x-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : <div />}

          {step < 5 ? (
            <button
              onClick={handleNext}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gold text-obsidian hover:bg-amber-400 transition flex items-center space-x-1"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-3 rounded-xl text-xs font-extrabold bg-gradient-to-r from-sage to-forest text-ivory hover:brightness-110 shadow-goldGlow transition disabled:opacity-50"
            >
              {submitting ? 'Publishing...' : 'Publish Listing'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
