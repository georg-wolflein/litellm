import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  Card,
  Title,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Grid,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
  Metric,
  Col,
  Text,
  SelectItem,
  TextInput,
  Button,
} from "@tremor/react";

import { message, Select } from "antd";
import { modelAvailableCall } from "./networking";
import openai from "openai";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Typography } from "antd";

interface ChatUIProps {
  accessToken: string | null;
  token: string | null;
  userRole: string | null;
  userID: string | null;
}

async function generateModelResponse(
  inputMessage: string,
  updateUI: (chunk: string) => void,
  selectedModel: string,
  accessToken: string
) {
  // base url should be the current base_url
  const isLocal = process.env.NODE_ENV === "development";
  if (isLocal != true) {
    console.log = function() {};
  }
  console.log("isLocal:", isLocal);
  const proxyBaseUrl = isLocal
    ? "http://localhost:4000"
    : window.location.origin;
  const client = new openai.OpenAI({
    apiKey: accessToken, // Replace with your OpenAI API key
    baseURL: proxyBaseUrl, // Replace with your OpenAI API base URL
    dangerouslyAllowBrowser: true, // using a temporary litellm proxy key
  });

  try {
    const response = await client.chat.completions.create({
      model: selectedModel,
      stream: true,
      messages: [
        {
          role: "user",
          content: inputMessage,
        },
      ],
    });

    for await (const chunk of response) {
      console.log(chunk);
      if (chunk.choices[0].delta.content) {
        updateUI(chunk.choices[0].delta.content);
      }
    }
  } catch (error) {
    message.error(`Error occurred while generating model response. Please try again. Error: ${error}`, 20);
  }
}

const ChatUI: React.FC<ChatUIProps> = ({
  accessToken,
  token,
  userRole,
  userID,
}) => {
  const [apiKeySource, setApiKeySource] = useState<'session' | 'custom'>('session');
  const [apiKey, setApiKey] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    undefined
  );
  const [modelInfo, setModelInfo] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken || !token || !userRole || !userID) {
      return;
    }

    // Fetch model info and set the default selected model
    const fetchModelInfo = async () => {
      try {
        const fetchedAvailableModels = await modelAvailableCall(
          accessToken,
          userID,
          userRole
        );
  
        console.log("model_info:", fetchedAvailableModels);
  
        if (fetchedAvailableModels?.data.length > 0) {
          // Create a Map to store unique models using the model ID as key
          const uniqueModelsMap = new Map();
          
          fetchedAvailableModels["data"].forEach((item: { id: string }) => {
            uniqueModelsMap.set(item.id, {
              value: item.id,
              label: item.id
            });
          });

          // Convert Map values back to array
          const uniqueModels = Array.from(uniqueModelsMap.values());

          // Sort models alphabetically
          uniqueModels.sort((a, b) => a.label.localeCompare(b.label));

          setModelInfo(uniqueModels);
          setSelectedModel(uniqueModels[0].value);
        }
      } catch (error) {
        console.error("Error fetching model info:", error);
      }
    };
  
    fetchModelInfo();
  }, [accessToken, userID, userRole]);
  

  useEffect(() => {
    // Scroll to the bottom of the chat whenever chatHistory updates
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory]);

  const updateUI = (role: string, chunk: string) => {
    setChatHistory((prevHistory) => {
      const lastMessage = prevHistory[prevHistory.length - 1];

      if (lastMessage && lastMessage.role === role) {
        return [
          ...prevHistory.slice(0, prevHistory.length - 1),
          { role, content: lastMessage.content + chunk },
        ];
      } else {
        return [...prevHistory, { role, content: chunk }];
      }
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSendMessage();
    }
  };

  const handleSendMessage = async () => {
    if (inputMessage.trim() === "") return;

    if (!token || !userRole || !userID) {
      return;
    }

    const effectiveApiKey = apiKeySource === 'session' ? accessToken : apiKey;

    if (!effectiveApiKey) {
      message.error("Please provide an API key or select Current UI Session");
      return;
    }

    setChatHistory((prevHistory) => [
      ...prevHistory,
      { role: "user", content: inputMessage },
    ]);

    try {
      if (selectedModel) {
        await generateModelResponse(
          inputMessage,
          (chunk) => updateUI("assistant", chunk),
          selectedModel,
          effectiveApiKey
        );
      }
    } catch (error) {
      console.error("Error fetching model response", error);
      updateUI("assistant", "Error fetching model response");
    }

    setInputMessage("");
  };

  if (userRole && userRole === "Admin Viewer") {
    const { Title, Paragraph } = Typography;
    return (
      <div>
        <Title level={1}>Access Denied</Title>
        <Paragraph>Ask your proxy admin for access to test models</Paragraph>
      </div>
    );
  }

  const onChange = (value: string) => {
    console.log(`selected ${value}`);
    setSelectedModel(value);
  };

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <Grid className="gap-2 p-8 h-[80vh] w-full mt-2">
        <Card>
          
          <TabGroup>
            <TabList>
              <Tab>Chat</Tab>
            </TabList>

            <TabPanels>
              <TabPanel>
              <div className="sm:max-w-2xl">
          <Grid numItems={2}>
            <Col>
              <Text>API Key Source</Text>
              <Select
                defaultValue="session"
                style={{ width: "100%" }}
                onChange={(value) => setApiKeySource(value as "session" | "custom")}
                options={[
                  { value: 'session', label: 'Current UI Session' },
                  { value: 'custom', label: 'Virtual Key' },
                ]}
              />
              {apiKeySource === 'custom' && (
                <TextInput
                  className="mt-2"
                  placeholder="Enter custom API key"
                  type="password"
                  onValueChange={setApiKey}
                  value={apiKey}
                />
              )}
            </Col>
            <Col className="mx-2">
            <Text>Select Model:</Text>

            <Select
                placeholder="Select a Model"
                onChange={onChange}
                options={modelInfo}
                style={{ width: "350px" }}
                showSearch={true}
              />
            </Col>
          </Grid>
        
          
        </div>
                <Table
                  className="mt-5"
                  style={{
                    display: "block",
                    maxHeight: "60vh",
                    overflowY: "auto",
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        {/* <Title>Chat</Title> */}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {chatHistory.map((message, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div style={{ 
                            whiteSpace: "pre-wrap", 
                            wordBreak: "break-word",
                            maxWidth: "100%" 
                          }}>
                            <strong>{message.role}:</strong> {message.content}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>
                        <div ref={chatEndRef} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <div
                  className="mt-3"
                  style={{ position: "absolute", bottom: 5, width: "95%" }}
                >
                  <div className="flex" style={{ marginTop: "16px" }}>
                    <TextInput
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={handleKeyDown} // Add this line
                      placeholder="Type your message..."
                    />
                    <Button
                      onClick={handleSendMessage}
                      className="ml-2"
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </TabPanel>
              
            </TabPanels>
          </TabGroup>
        </Card>
      </Grid>
    </div>
  );
};

export default ChatUI;
