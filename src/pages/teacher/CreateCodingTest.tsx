import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowLeft, Save } from "lucide-react";

interface TestCase {
  input: string;
  expectedOutput: string;
}

interface CodingQuestionForm {
  question_text: string;
  test_cases: TestCase[];
}

const emptyTestCase: TestCase = { input: "", expectedOutput: "" };
const emptyQuestion: CodingQuestionForm = {
  question_text: "",
  test_cases: [{ ...emptyTestCase }],
};

export default function CreateCodingTest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [isPublished, setIsPublished] = useState(false);
  const [language, setLanguage] = useState("c");
  const [questions, setQuestions] = useState<CodingQuestionForm[]>([{ ...emptyQuestion, test_cases: [{ ...emptyTestCase }] }]);

  const updateQuestion = (qi: number, field: string, value: string) => {
    const updated = [...questions];
    (updated[qi] as any)[field] = value;
    setQuestions(updated);
  };

  const addTestCase = (qi: number) => {
    const updated = [...questions];
    updated[qi].test_cases.push({ ...emptyTestCase });
    setQuestions(updated);
  };

  const removeTestCase = (qi: number, ti: number) => {
    const updated = [...questions];
    if (updated[qi].test_cases.length <= 1) return;
    updated[qi].test_cases = updated[qi].test_cases.filter((_, i) => i !== ti);
    setQuestions(updated);
  };

  const updateTestCase = (qi: number, ti: number, field: keyof TestCase, value: string) => {
    const updated = [...questions];
    updated[qi].test_cases[ti][field] = value;
    setQuestions(updated);
  };

  const addQuestion = () => setQuestions([...questions, { ...emptyQuestion, test_cases: [{ ...emptyTestCase }] }]);
  const removeQuestion = (qi: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== qi));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { data: test, error: testError } = await supabase
        .from("coding_tests")
        .insert({ title, description, duration_minutes: duration, is_published: isPublished, teacher_id: user.id, language } as any)
        .select()
        .single();
      if (testError) throw testError;

      const questionsToInsert = questions.map((q, i) => ({
        coding_test_id: test.id,
        question_text: q.question_text,
        sort_order: i,
        test_cases: JSON.parse(JSON.stringify(q.test_cases)),
      }));
      const { error: qError } = await supabase.from("coding_questions").insert(questionsToInsert);
      if (qError) throw qError;

      toast.success("Coding test created!");
      navigate("/teacher");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout
      title="Create Coding Test"
      actions={<Button variant="ghost" onClick={() => navigate("/teacher")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>}
    >
      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Test Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. C Programming Lab 1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration (minutes)</Label>
                <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={1} required />
              </div>
              <div>
                <Label>Programming Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="c">C</SelectItem>
                    <SelectItem value="cpp">C++</SelectItem>
                    <SelectItem value="java">Java</SelectItem>
                    <SelectItem value="python">Python</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
              <Label>Publish immediately</Label>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Questions ({questions.length})</h2>
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
              <Plus className="w-4 h-4 mr-1" /> Add Question
            </Button>
          </div>

          {questions.map((q, qi) => (
            <Card key={qi} className="animate-fade-in">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Question {qi + 1}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(qi)} disabled={questions.length === 1}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Describe the coding problem..."
                  value={q.question_text}
                  onChange={e => updateQuestion(qi, "question_text", e.target.value)}
                  required
                  className="min-h-[100px]"
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Test Cases ({q.test_cases.length})</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addTestCase(qi)}>
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  {q.test_cases.map((tc, ti) => (
                    <div key={ti} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 p-3 rounded-lg bg-secondary/50">
                      <div>
                        <Label className="text-xs">Input (stdin)</Label>
                        <Textarea
                          placeholder="e.g. 5 3"
                          value={tc.input}
                          onChange={e => updateTestCase(qi, ti, "input", e.target.value)}
                          className="min-h-[60px] text-xs font-mono"
                          required
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Expected Output</Label>
                        <Textarea
                          placeholder="e.g. 8"
                          value={tc.expectedOutput}
                          onChange={e => updateTestCase(qi, ti, "expectedOutput", e.target.value)}
                          className="min-h-[60px] text-xs font-mono"
                          required
                        />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeTestCase(qi, ti)} disabled={q.test_cases.length <= 1} className="self-end">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" /> {loading ? "Creating..." : "Create Coding Test"}
        </Button>
      </form>
    </DashboardLayout>
  );
}
