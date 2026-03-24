import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Save, Plus, Trash2 } from "lucide-react";

interface QuestionForm {
  id?: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  marks: number;
}

export default function EditTest() {
  const { testId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [isPublished, setIsPublished] = useState(false);
  const [allowReview, setAllowReview] = useState(true);
  const [questions, setQuestions] = useState<QuestionForm[]>([]);

  const { data: test } = useQuery({
    queryKey: ["test-edit", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("tests").select("*").eq("id", testId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: existingQuestions } = useQuery({
    queryKey: ["test-questions-edit", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("questions").select("*").eq("test_id", testId!).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (test) {
      setTitle(test.title);
      setDescription(test.description || "");
      setDuration(test.duration_minutes);
      setIsPublished(test.is_published);
      setAllowReview(test.allow_result_review);
    }
  }, [test]);

  useEffect(() => {
    if (existingQuestions) {
      setQuestions(existingQuestions.map(q => ({
        id: q.id, question_text: q.question_text,
        option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
        correct_option: q.correct_option, marks: q.marks,
      })));
    }
  }, [existingQuestions]);

  const updateQuestion = (index: number, field: keyof QuestionForm, value: any) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const addQuestion = () => setQuestions([...questions, {
    question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A", marks: 1,
  }]);

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supabase.from("tests").update({
        title, description, duration_minutes: duration, is_published: isPublished, allow_result_review: allowReview,
      }).eq("id", testId!);

      // Delete old questions and re-insert
      await supabase.from("questions").delete().eq("test_id", testId!);
      const questionsToInsert = questions.map((q, i) => ({
        test_id: testId!, question_text: q.question_text,
        option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
        correct_option: q.correct_option, marks: q.marks, sort_order: i,
      }));
      await supabase.from("questions").insert(questionsToInsert);

      toast.success("Test updated!");
      navigate("/teacher");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!test) return null;

  return (
    <DashboardLayout
      title="Edit Test"
      actions={<Button variant="ghost" onClick={() => navigate("/teacher")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>}
    >
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Test Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
            <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
            <div className="w-48"><Label>Duration (minutes)</Label><Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={1} required /></div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><Switch checked={isPublished} onCheckedChange={setIsPublished} /><Label>Published</Label></div>
              <div className="flex items-center gap-2"><Switch checked={allowReview} onCheckedChange={setAllowReview} /><Label>Allow review</Label></div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Questions ({questions.length})</h2>
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}><Plus className="w-4 h-4 mr-1" /> Add</Button>
          </div>
          {questions.map((q, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Q{i + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(i)} disabled={questions.length <= 1}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
                <Textarea placeholder="Question text" value={q.question_text} onChange={e => updateQuestion(i, "question_text", e.target.value)} required />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(["A","B","C","D"] as const).map(opt => (
                    <div key={opt} className="flex items-center gap-2">
                      <button type="button" onClick={() => updateQuestion(i, "correct_option", opt)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-all ${q.correct_option === opt ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}`}>{opt}</button>
                      <Input placeholder={`Option ${opt}`} value={(q as any)[`option_${opt.toLowerCase()}`]} onChange={e => updateQuestion(i, `option_${opt.toLowerCase()}` as keyof QuestionForm, e.target.value)} required />
                    </div>
                  ))}
                </div>
                <div className="w-24"><Label className="text-xs">Marks</Label><Input type="number" min={1} value={q.marks} onChange={e => updateQuestion(i, "marks", Number(e.target.value))} /></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button type="submit" disabled={loading}><Save className="w-4 h-4 mr-2" /> {loading ? "Saving..." : "Save Changes"}</Button>
      </form>
    </DashboardLayout>
  );
}
