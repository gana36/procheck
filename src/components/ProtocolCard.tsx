import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Star, 
  Copy, 
  Download, 
  Share2, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Save,
  FileText,
  Users,
  Calendar,
  MapPin,
  Building
} from 'lucide-react';
import { ProtocolData } from '@/types';

interface ProtocolCardProps {
  protocolData: ProtocolData;
}

export default function ProtocolCard({ protocolData }: ProtocolCardProps) {
  const [isSaved, setIsSaved] = useState(false);
  const [isReferencesOpen, setIsReferencesOpen] = useState(false);
  const [savedSteps, setSavedSteps] = useState<number[]>([]);

  const handleSave = () => {
    setIsSaved(!isSaved);
  };

  const handleCopy = () => {
    const stepsText = protocolData.steps
      .map((step, index) => `${index + 1}. ${step.step}`)
      .join('\n');
    navigator.clipboard.writeText(stepsText);
  };

  const handleDownload = () => {
    // Placeholder for PDF generation
    console.log('Download PDF functionality would be implemented here');
  };

  const handleShare = () => {
    // Placeholder for sharing functionality
    console.log('Share functionality would be implemented here');
  };

  const handleSaveStep = (stepId: number) => {
    setSavedSteps(prev => 
      prev.includes(stepId) 
        ? prev.filter(id => id !== stepId)
        : [...prev, stepId]
    );
  };

  const handleCopyStep = (step: string) => {
    navigator.clipboard.writeText(step);
  };

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      {/* Header */}
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl text-slate-900 mb-2">
              {protocolData.title}
            </CardTitle>
            <div className="flex items-center space-x-2 mb-3">
              <Badge variant="secondary" className="bg-teal-100 text-teal-700">
                <MapPin className="h-3 w-3 mr-1" />
                {protocolData.region}
              </Badge>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                <Calendar className="h-3 w-3 mr-1" />
                {protocolData.year}
              </Badge>
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                <Building className="h-3 w-3 mr-1" />
                {protocolData.organization}
              </Badge>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleSave}
              className={isSaved ? 'bg-yellow-50 border-yellow-200' : ''}
            >
              <Star className={`h-4 w-4 ${isSaved ? 'text-yellow-500 fill-current' : 'text-slate-500'}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={handleCopy}>
              <Copy className="h-4 w-4 text-slate-500" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4 text-slate-500" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleShare}>
              <Share2 className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Protocol Steps */}
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {protocolData.steps.map((step) => (
            <Card key={step.id} className="bg-slate-50 border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-teal-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                      {step.id}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <p className="text-sm text-slate-900 leading-relaxed">
                        {step.step}
                        {step.citations.map((citationId) => (
                          <sup key={citationId} className="text-xs text-teal-600 font-semibold ml-1">
                            [{citationId}]
                          </sup>
                        ))}
                      </p>
                      <div className="flex items-center space-x-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSaveStep(step.id)}
                          className={`h-6 w-6 ${savedSteps.includes(step.id) ? 'bg-yellow-50' : ''}`}
                        >
                          <Save className={`h-3 w-3 ${savedSteps.includes(step.id) ? 'text-yellow-500' : 'text-slate-400'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyStep(step.step)}
                          className="h-6 w-6"
                        >
                          <Copy className="h-3 w-3 text-slate-400" />
                        </Button>
                      </div>
                    </div>
                    {step.isNew && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700 mt-2 text-xs">
                        New in {protocolData.year}
                      </Badge>
                    )}
                    {step.changes && (
                      <p className="text-xs text-slate-600 mt-2 italic">
                        {step.changes}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Follow-up Actions */}
        <div className="pt-4 border-t border-slate-200">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="text-slate-600">
              <FileText className="h-4 w-4 mr-2" />
              Compare with last year
            </Button>
            <Button variant="outline" size="sm" className="text-slate-600">
              <Download className="h-4 w-4 mr-2" />
              Export as PDF
            </Button>
            <Button variant="outline" size="sm" className="text-slate-600">
              <Users className="h-4 w-4 mr-2" />
              Send to team
            </Button>
          </div>
        </div>

        {/* References Section */}
        <div className="pt-4 border-t border-slate-200">
          <Button
            variant="ghost"
            onClick={() => setIsReferencesOpen(!isReferencesOpen)}
            className="w-full justify-between p-0 h-auto"
          >
            <span className="text-sm font-medium text-slate-900">
              References ({protocolData.citations.length})
            </span>
            {isReferencesOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </Button>
          
          {isReferencesOpen && (
            <div className="mt-4 space-y-3">
              {protocolData.citations.map((citation) => (
                <Card key={citation.id} className="bg-slate-50 border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-semibold text-teal-600">
                            [{citation.id}]
                          </span>
                          <h4 className="text-sm font-medium text-slate-900">
                            {citation.source}
                          </h4>
                        </div>
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                            {citation.organization}
                          </Badge>
                          <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                            {citation.year}
                          </Badge>
                          <Badge variant="secondary" className="bg-slate-200 text-slate-700 text-xs">
                            {citation.region}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {citation.excerpt}
                        </p>
                      </div>
                      {citation.url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(citation.url, '_blank')}
                          className="ml-2 h-6 w-6"
                        >
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
